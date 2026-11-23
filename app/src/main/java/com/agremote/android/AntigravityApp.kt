package com.agremote.android

import android.Manifest
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.mozilla.geckoview.ContentBlocking
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.WebExtension
import org.mozilla.geckoview.WebNotification
import org.mozilla.geckoview.WebNotificationDelegate
import java.io.File
import java.util.concurrent.atomic.AtomicInteger

data class PrewarmedSession(
    val session: GeckoSession,
    val url: String,
    val firstPaintSeen: Boolean,
    val pageStopped: Boolean,
    val progress: Int
)

class AntigravityApp : Application() {
    val settingsStore: SettingsStore by lazy { SettingsStore(this) }
    val extensionBridge: ExtensionBridge by lazy { ExtensionBridge() }

    @Volatile
    private var runtimeInstance: GeckoRuntime? = null

    @Volatile
    var builtInExtension: WebExtension? = null
        private set

    private var prewarmedSession: GeckoSession? = null
    private var prewarmedUrl: String = UrlPolicy.DEFAULT_HOME_URL
    private var prewarmedCurrentLocation: String = "about:blank"
    private var prewarmedFirstPaint = false
    private var prewarmedStopped = false
    private var prewarmedProgress = 0

    private val notificationIdCounter = AtomicInteger(1000)

    override fun onCreate() {
        super.onCreate()
        if (!isMainProcess()) {
            return
        }
        createNotificationChannel()
        val settings = settingsStore.load()
        extensionBridge.updateConfig(settings)
        val runtime = ensureRuntime()
        prewarmStartupSession(runtime, settings)
    }

    fun ensureRuntime(): GeckoRuntime {
        runtimeInstance?.let { return it }
        synchronized(this) {
            runtimeInstance?.let { return it }
            // Dedicated Antigravity client routes third-party links externally; disable GeckoView
            // SafeBrowsing/tracking list sync and DoH probing to prevent background VPN contention
            // and Fake-IP DNS conflicts on cellular networks.
            val contentBlocking = ContentBlocking.Settings.Builder()
                .antiTracking(ContentBlocking.AntiTracking.NONE)
                .safeBrowsing(ContentBlocking.SafeBrowsing.NONE)
                .safeBrowsingRealTimeEnabled(false)
                .build()

            val runtimeSettings = GeckoRuntimeSettings.Builder()
                .javaScriptEnabled(true)
                .webManifest(true)
                .extensionsWebAPIEnabled(true)
                .preferredColorScheme(GeckoRuntimeSettings.COLOR_SCHEME_SYSTEM)
                .inputAutoZoomEnabled(false)
                .doubleTapZoomingEnabled(true)
                .consoleOutput(BuildConfig.DEBUG)
                .remoteDebuggingEnabled(false)
                .aboutConfigEnabled(false)
                .trustedRecursiveResolverMode(GeckoRuntimeSettings.TRR_MODE_OFF)
                .contentBlocking(contentBlocking)
                .build()

            // Persistent default profile (never private mode) so Google login & cookies survive restarts.
            val runtime = GeckoRuntime.create(this, runtimeSettings)
            runtime.settings.fetchPriorityEnabled = true
            runtime.settings.setDohAutoselectEnabled(false)
            runtime.webNotificationDelegate = webNotificationDelegate
            installBuiltInExtension(runtime)
            runtimeInstance = runtime
            return runtime
        }
    }

    private fun prewarmStartupSession(runtime: GeckoRuntime, settings: AppSettings) {
        if (prewarmedSession != null) return
        val startupUrl = SettingsStore.resolveStartupUrl(settings)
        val session = GeckoSession(buildSessionSettings(settings))
        session.setPriorityHint(GeckoSession.PRIORITY_HIGH)
        session.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean
            ) {
                if (!url.isNullOrBlank()) {
                    prewarmedCurrentLocation = url
                }
            }
        }
        session.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onFirstContentfulPaint(session: GeckoSession) {
                if (!prewarmedCurrentLocation.startsWith("about:")) {
                    prewarmedFirstPaint = true
                }
            }
        }
        session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onProgressChange(session: GeckoSession, progress: Int) {
                if (!prewarmedCurrentLocation.startsWith("about:")) {
                    prewarmedProgress = progress
                }
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                if (!prewarmedCurrentLocation.startsWith("about:")) {
                    prewarmedStopped = true
                }
            }
        }
        session.open(runtime)
        session.loadUri(startupUrl)

        prewarmedSession = session
        prewarmedUrl = startupUrl
        prewarmedCurrentLocation = "about:blank"
        prewarmedFirstPaint = false
        prewarmedStopped = false
        prewarmedProgress = 0
        Log.i(TAG, "Prewarmed startup GeckoSession for url=$startupUrl")
    }

    @Synchronized
    fun consumePrewarmedSession(): PrewarmedSession? {
        val session = prewarmedSession ?: return null
        prewarmedSession = null
        return PrewarmedSession(
            session = session,
            url = prewarmedUrl,
            firstPaintSeen = prewarmedFirstPaint,
            pageStopped = prewarmedStopped,
            progress = prewarmedProgress
        )
    }

    fun buildSessionSettings(settings: AppSettings): GeckoSessionSettings {
        val uaMode = if (settings.desktopMode) {
            GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
        } else {
            GeckoSessionSettings.USER_AGENT_MODE_MOBILE
        }
        val viewportMode = if (settings.desktopMode) {
            GeckoSessionSettings.VIEWPORT_MODE_DESKTOP
        } else {
            GeckoSessionSettings.VIEWPORT_MODE_MOBILE
        }
        return GeckoSessionSettings.Builder()
            .usePrivateMode(false)
            .allowJavascript(true)
            .userAgentMode(uaMode)
            .viewportMode(viewportMode)
            .build()
    }

    private fun installBuiltInExtension(runtime: GeckoRuntime) {
        runtime.webExtensionController
            .ensureBuiltIn(ExtensionBridge.EXTENSION_URI, ExtensionBridge.EXTENSION_ID)
            .accept(
                { extension ->
                    if (extension != null) {
                        builtInExtension = extension
                        extensionBridge.attachExtension(extension)
                    }
                },
                { throwable ->
                    Log.e(TAG, "Failed to install built-in localization extension", throwable)
                }
            )
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "Antigravity 远程通知",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "来自 Antigravity Remote 网页的任务状态与审批通知"
        }
        manager.createNotificationChannel(channel)
    }

    private val webNotificationDelegate = object : WebNotificationDelegate {
        override fun onShowNotification(notification: WebNotification) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(
                    this@AntigravityApp,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }

            val launchIntent = Intent(this@AntigravityApp, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this@AntigravityApp,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val id = if (!notification.tag.isNullOrBlank()) {
                notification.tag.hashCode()
            } else {
                notificationIdCounter.incrementAndGet()
            }

            val builder = NotificationCompat.Builder(this@AntigravityApp, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(notification.title?.ifBlank { getString(R.string.app_name) }
                    ?: getString(R.string.app_name))
                .setContentText(notification.text.orEmpty())
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)

            try {
                NotificationManagerCompat.from(this@AntigravityApp).notify(id, builder.build())
                notification.show()
            } catch (se: SecurityException) {
                Log.w(TAG, "Notification permission rejected at runtime", se)
            }
        }

        override fun onCloseNotification(notification: WebNotification) {
            if (!notification.tag.isNullOrBlank()) {
                NotificationManagerCompat.from(this@AntigravityApp)
                    .cancel(notification.tag.hashCode())
            }
        }
    }

    private fun isMainProcess(): Boolean {
        val currentName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getProcessName()
        } else {
            readCmdlineProcessName()
        }
        return currentName == null || currentName == packageName
    }

    private fun readCmdlineProcessName(): String? {
        return runCatching {
            File("/proc/self/cmdline").readText().trim('\u0000', ' ', '\n', '\r')
        }.getOrNull()
    }

    companion object {
        private const val TAG = "AntigravityApp"
        private const val NOTIFICATION_CHANNEL_ID = "ag_remote_alerts"
    }
}
