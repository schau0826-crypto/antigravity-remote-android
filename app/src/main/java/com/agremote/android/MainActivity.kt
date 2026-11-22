package com.agremote.android

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.webkit.MimeTypeMap
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.ContentDelegate
import org.mozilla.geckoview.GeckoSession.NavigationDelegate
import org.mozilla.geckoview.GeckoSession.PermissionDelegate
import org.mozilla.geckoview.GeckoSession.PermissionDelegate.ContentPermission
import org.mozilla.geckoview.GeckoSession.ProgressDelegate
import org.mozilla.geckoview.GeckoSession.PromptDelegate
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.StorageController
import kotlin.math.abs

class MainActivity : AppCompatActivity() {

    private lateinit var app: AntigravityApp
    private lateinit var runtime: GeckoRuntime
    private lateinit var settingsStore: SettingsStore
    private lateinit var currentSettings: AppSettings

    private lateinit var rootContainer: FrameLayout
    private lateinit var pageProgress: ProgressBar
    private lateinit var geckoView: GeckoView
    private lateinit var loadingOverlay: LinearLayout
    private lateinit var btnRetryLoad: Button
    private lateinit var fabQuickMenu: FrameLayout
    private lateinit var viewFabStatusDot: View
    private lateinit var tvFabCtxPct: TextView

    private lateinit var popupContainer: LinearLayout
    private lateinit var popupTitle: TextView
    private lateinit var btnClosePopup: TextView
    private lateinit var popupGeckoView: GeckoView

    private lateinit var primarySession: GeckoSession
    private var popupSession: GeckoSession? = null

    private var primaryCanGoBack = false
    private var popupCanGoBack = false
    private var currentUrl: String = UrlPolicy.DEFAULT_HOME_URL
    private var primaryHasNonBlankLocation = false

    private var quickMenuSheet: BottomSheetDialog? = null
    private var sheetStatusView: TextView? = null
    private var sheetTelemetryViews: QuickSheetTelemetryViews? = null
    private var settingsDialog: AlertDialog? = null
    private var settingsExtStatusView: TextView? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private var loadingDismissed = false
    private var lastBackgroundAtMs = 0L
    private var handledStallForCurrentResume = false
    private var lastAutoReconnectAtMs = 0L
    private var switchCounter = 0
    private var pendingSwitchRequestId: String? = null
    private var pendingSwitchFallbackRunnable: Runnable? = null

    private data class QuickSheetTelemetryViews(
        val cardContextTelemetry: LinearLayout,
        val tvCtxModel: TextView,
        val tvCtxStatusBadge: TextView,
        val layoutCtxUsage: LinearLayout,
        val tvCtxUsageText: TextView,
        val progressCtxUsage: ProgressBar,
        val tvCtxMetricsDetail: TextView,
        val containerRecentConversations: LinearLayout,
        val tvRecentConvEmpty: TextView
    )

    private val retryPromptRunnable = Runnable {
        if (!loadingDismissed && loadingOverlay.visibility == View.VISIBLE) {
            btnRetryLoad.visibility = View.VISIBLE
        }
    }

    private var pendingAndroidPermissionCallback: PermissionDelegate.Callback? = null
    private var pendingNotificationPermissionResult: GeckoResult<Int>? = null
    private var pendingFilePrompt: PromptDelegate.FilePrompt? = null
    private var pendingFileResult: GeckoResult<PromptDelegate.PromptResponse>? = null

    private val requestMultiplePermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val callback = pendingAndroidPermissionCallback
            pendingAndroidPermissionCallback = null
            if (callback != null) {
                if (results.values.all { it }) {
                    callback.grant()
                } else {
                    callback.reject()
                }
            }
        }

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val result = pendingNotificationPermissionResult
            pendingNotificationPermissionResult = null
            result?.complete(
                if (granted) ContentPermission.VALUE_ALLOW else ContentPermission.VALUE_DENY
            )
        }

    private val openDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val prompt = pendingFilePrompt
            val result = pendingFileResult
            pendingFilePrompt = null
            pendingFileResult = null
            if (prompt != null && result != null) {
                if (uri != null) {
                    result.complete(prompt.confirm(this, uri))
                } else {
                    result.complete(prompt.dismiss())
                }
            }
        }

    private val openMultipleDocumentsLauncher =
        registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            val prompt = pendingFilePrompt
            val result = pendingFileResult
            pendingFilePrompt = null
            pendingFileResult = null
            if (prompt != null && result != null) {
                if (!uris.isNullOrEmpty()) {
                    result.complete(prompt.confirm(this, uris.toTypedArray()))
                } else {
                    result.complete(prompt.dismiss())
                }
            }
        }

    private val bridgeListener: (BridgeState) -> Unit = { state ->
        updateExtStatusLabel(state)
    }

    private val snapshotListener: (SessionSnapshot) -> Unit = { snapshot ->
        updateFloatingHandleTelemetry(snapshot)
        renderQuickSheetTelemetry(snapshot)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        app = application as AntigravityApp
        runtime = app.ensureRuntime()
        settingsStore = app.settingsStore
        currentSettings = settingsStore.load()

        bindViews()
        setupInsets()
        syncSystemBarsAppearance(resources.configuration)
        setupFloatingHandle()
        setupLoadingOverlay()
        setupBackNavigation()

        app.extensionBridge.addListener(bridgeListener)
        app.extensionBridge.addSnapshotListener(snapshotListener)
        app.extensionBridge.onStreamStalledListener = { hasDraft, backgroundMs ->
            handleStreamStalledFromExtension(hasDraft, backgroundMs)
        }
        app.extensionBridge.onSwitchResultListener = { requestId, cascadeId, projectId, switched ->
            handleSwitchResultFromExtension(requestId, cascadeId, projectId, switched)
        }
        app.extensionBridge.updateConfig(currentSettings)
        applyKeepScreenOn(currentSettings.keepScreenOn)

        val deepLinkUrl = extractDeepLinkUrl(intent)
        initPrimarySession(deepLinkUrl)
    }

    private fun initPrimarySession(deepLinkUrl: String?) {
        val prewarmed = app.consumePrewarmedSession()
        if (prewarmed != null && prewarmed.session.isOpen) {
            primarySession = prewarmed.session
            attachDelegates(primarySession, isPopup = false)
            primarySession.setPriorityHint(GeckoSession.PRIORITY_HIGH)
            geckoView.setSession(primarySession)

            if (deepLinkUrl != null && deepLinkUrl != prewarmed.url) {
                currentUrl = deepLinkUrl
                primarySession.loadUri(deepLinkUrl)
            } else {
                currentUrl = prewarmed.url
                if (prewarmed.firstPaintSeen || prewarmed.pageStopped || prewarmed.progress >= 75) {
                    dismissLoadingOverlay(immediate = true)
                }
            }
            return
        }

        val startupUrl = deepLinkUrl ?: SettingsStore.resolveStartupUrl(currentSettings)
        currentUrl = startupUrl
        primarySession = createConfiguredSession(currentSettings)
        attachDelegates(primarySession, isPopup = false)
        primarySession.setPriorityHint(GeckoSession.PRIORITY_HIGH)
        primarySession.open(runtime)
        geckoView.setSession(primarySession)
        primarySession.loadUri(startupUrl)
    }

    override fun onStart() {
        super.onStart()
        if (::primarySession.isInitialized && primarySession.isOpen) {
            primarySession.setPriorityHint(GeckoSession.PRIORITY_HIGH)
            primarySession.setActive(true)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::primarySession.isInitialized && primarySession.isOpen) {
            primarySession.setPriorityHint(GeckoSession.PRIORITY_HIGH)
            primarySession.setActive(true)
            primarySession.setFocused(true)
        }

        val backgroundMs = if (lastBackgroundAtMs > 0L) {
            (System.currentTimeMillis() - lastBackgroundAtMs).coerceAtLeast(0L)
        } else {
            0L
        }
        lastBackgroundAtMs = 0L

        if (backgroundMs >= 2000L) {
            handledStallForCurrentResume = false
            app.extensionBridge.sendAppResumed(backgroundMs)
        }
    }

    override fun onStop() {
        super.onStop()
        lastBackgroundAtMs = System.currentTimeMillis()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val deepLinkUrl = extractDeepLinkUrl(intent) ?: return
        closePopupSession()
        currentUrl = deepLinkUrl
        primarySession.loadUri(deepLinkUrl)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        runtime.configurationChanged(newConfig)
        syncSystemBarsAppearance(newConfig)
        positionFloatingHandle(currentSettings.fabOffsetRatio)
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(retryPromptRunnable)
        clearPendingSwitchFallback()
        app.extensionBridge.onStreamStalledListener = null
        app.extensionBridge.onSwitchResultListener = null
        app.extensionBridge.removeListener(bridgeListener)
        app.extensionBridge.removeSnapshotListener(snapshotListener)
        quickMenuSheet?.dismiss()
        quickMenuSheet = null
        sheetTelemetryViews = null
        settingsDialog?.dismiss()
        settingsDialog = null

        if (isFinishing) {
            pendingFilePrompt?.let { prompt ->
                pendingFileResult?.complete(prompt.dismiss())
            }
            pendingFilePrompt = null
            pendingFileResult = null
            pendingNotificationPermissionResult?.complete(ContentPermission.VALUE_DENY)
            pendingNotificationPermissionResult = null
            pendingAndroidPermissionCallback?.reject()
            pendingAndroidPermissionCallback = null
        }

        closePopupSession()
        geckoView.releaseSession()
        if (::primarySession.isInitialized && primarySession.isOpen) {
            primarySession.close()
        }
        super.onDestroy()
    }

    private fun bindViews() {
        rootContainer = findViewById(R.id.root_container)
        pageProgress = findViewById(R.id.page_progress)
        geckoView = findViewById(R.id.gecko_view)
        loadingOverlay = findViewById(R.id.loading_overlay)
        btnRetryLoad = findViewById(R.id.btn_retry_load)
        fabQuickMenu = findViewById(R.id.fab_quick_menu)
        viewFabStatusDot = findViewById(R.id.view_fab_status_dot)
        tvFabCtxPct = findViewById(R.id.tv_fab_ctx_pct)

        popupContainer = findViewById(R.id.popup_container)
        popupTitle = findViewById(R.id.popup_title)
        btnClosePopup = findViewById(R.id.btn_close_popup)
        popupGeckoView = findViewById(R.id.popup_gecko_view)

        btnClosePopup.setOnClickListener {
            closePopupSession()
        }
    }

    private fun setupInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            view.updatePadding(
                left = insets.left,
                top = insets.top,
                right = insets.right,
                bottom = insets.bottom
            )
            windowInsets
        }
    }

    private fun syncSystemBarsAppearance(config: Configuration) {
        val isNight = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = !isNight
        controller.isAppearanceLightNavigationBars = !isNight
    }

    private fun setupLoadingOverlay() {
        loadingOverlay.visibility = View.VISIBLE
        loadingOverlay.alpha = 1f
        btnRetryLoad.visibility = View.GONE
        mainHandler.removeCallbacks(retryPromptRunnable)
        mainHandler.postDelayed(retryPromptRunnable, 8000L)

        btnRetryLoad.setOnClickListener {
            btnRetryLoad.visibility = View.GONE
            mainHandler.removeCallbacks(retryPromptRunnable)
            mainHandler.postDelayed(retryPromptRunnable, 8000L)
            primarySession.reload()
        }
    }

    private fun dismissLoadingOverlay(immediate: Boolean = false) {
        if (loadingDismissed) return
        loadingDismissed = true
        mainHandler.removeCallbacks(retryPromptRunnable)
        if (immediate || loadingOverlay.visibility != View.VISIBLE) {
            loadingOverlay.visibility = View.GONE
            loadingOverlay.alpha = 1f
            return
        }
        loadingOverlay.animate()
            .alpha(0f)
            .setDuration(180L)
            .withEndAction {
                loadingOverlay.visibility = View.GONE
                loadingOverlay.alpha = 1f
            }
            .start()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupFloatingHandle() {
        rootContainer.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            positionFloatingHandle(currentSettings.fabOffsetRatio)
        }
        fabQuickMenu.post {
            positionFloatingHandle(currentSettings.fabOffsetRatio)
        }

        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var downRawY = 0f
        var startTranslationY = 0f
        var dragging = false

        fabQuickMenu.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downRawY = event.rawY
                    startTranslationY = view.translationY
                    dragging = false
                    view.alpha = 1.0f
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val deltaY = event.rawY - downRawY
                    if (!dragging && abs(deltaY) > touchSlop) {
                        dragging = true
                    }
                    if (dragging) {
                        val availableHeight = getFabAvailableHeight()
                        val minY = availableHeight * 0.12f
                        val maxY = availableHeight * 0.85f
                        view.translationY = (startTranslationY + deltaY).coerceIn(minY, maxY)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    view.alpha = 0.88f
                    if (dragging) {
                        val availableHeight = getFabAvailableHeight().coerceAtLeast(1f)
                        val ratio = (view.translationY / availableHeight).coerceIn(0.15f, 0.85f)
                        currentSettings = currentSettings.copy(fabOffsetRatio = ratio)
                        settingsStore.saveFabOffsetRatio(ratio)
                    } else {
                        showQuickMenuSheet()
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    view.alpha = 0.88f
                    true
                }
                else -> false
            }
        }
    }

    private fun getFabAvailableHeight(): Float {
        val parentH = (rootContainer.height - rootContainer.paddingTop - rootContainer.paddingBottom)
            .coerceAtLeast(1)
        val fabH = fabQuickMenu.height.takeIf { it > 0 } ?: 120
        return (parentH - fabH).coerceAtLeast(1).toFloat()
    }

    private fun positionFloatingHandle(ratio: Float) {
        val available = getFabAvailableHeight()
        if (available <= 1f) return
        val clamped = ratio.coerceIn(0.15f, 0.85f)
        fabQuickMenu.translationY = available * clamped
    }

    private fun handleStreamStalledFromExtension(hasDraft: Boolean, backgroundMs: Long) {
        if (handledStallForCurrentResume || isFinishing || isDestroyed) {
            return
        }
        if (!currentSettings.autoReconnectOnResume || popupContainer.visibility == View.VISIBLE) {
            return
        }
        val now = System.currentTimeMillis()
        if (now - lastAutoReconnectAtMs < 12_000L) {
            return
        }

        handledStallForCurrentResume = true
        if (hasDraft) {
            Toast.makeText(
                this,
                "后台切回可能已断流（检测到输入框草稿，未自动刷新，可点右侧悬浮球同步）",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        lastAutoReconnectAtMs = now
        Log.i(TAG, "Auto-reloading primarySession after background stall (${backgroundMs}ms)")
        Toast.makeText(this, "检测到后台断流，正在自动同步最新进度…", Toast.LENGTH_SHORT).show()
        if (UrlPolicy.isRememberableRemoteUrl(currentUrl)) {
            primarySession.load(
                GeckoSession.Loader()
                    .uri(currentUrl)
                    .flags(GeckoSession.LOAD_FLAGS_REPLACE_HISTORY)
            )
        } else {
            primarySession.reload()
        }
    }

    private fun showQuickMenuSheet() {
        quickMenuSheet?.dismiss()

        val sheet = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.sheet_quick_menu, null)
        sheet.setContentView(view)

        val tvSheetStatus = view.findViewById<TextView>(R.id.tv_sheet_status)
        val telemetryViews = QuickSheetTelemetryViews(
            cardContextTelemetry = view.findViewById(R.id.card_context_telemetry),
            tvCtxModel = view.findViewById(R.id.tv_ctx_model),
            tvCtxStatusBadge = view.findViewById(R.id.tv_ctx_status_badge),
            layoutCtxUsage = view.findViewById(R.id.layout_ctx_usage),
            tvCtxUsageText = view.findViewById(R.id.tv_ctx_usage_text),
            progressCtxUsage = view.findViewById(R.id.progress_ctx_usage),
            tvCtxMetricsDetail = view.findViewById(R.id.tv_ctx_metrics_detail),
            containerRecentConversations = view.findViewById(R.id.container_recent_conversations),
            tvRecentConvEmpty = view.findViewById(R.id.tv_recent_conv_empty)
        )
        val tileHome = view.findViewById<LinearLayout>(R.id.tile_home)
        val tileBack = view.findViewById<LinearLayout>(R.id.tile_back)
        val tileReload = view.findViewById<LinearLayout>(R.id.tile_reload)
        val tileI18n = view.findViewById<LinearLayout>(R.id.tile_i18n)
        val tvTileI18nBadge = view.findViewById<TextView>(R.id.tv_tile_i18n_badge)
        val tvTileI18nLabel = view.findViewById<TextView>(R.id.tv_tile_i18n_label)
        val tileDesktopUa = view.findViewById<LinearLayout>(R.id.tile_desktop_ua)
        val tvTileUaLabel = view.findViewById<TextView>(R.id.tv_tile_ua_label)
        val tileSettings = view.findViewById<LinearLayout>(R.id.tile_settings)
        val tvMachineHint = view.findViewById<TextView>(R.id.tv_sheet_machine_hint)
        val btnClearCache = view.findViewById<TextView>(R.id.btn_sheet_clear_cache)

        sheetStatusView = tvSheetStatus
        sheetTelemetryViews = telemetryViews
        updateExtStatusLabel(app.extensionBridge.state)
        renderQuickSheetTelemetry(app.extensionBridge.latestSnapshot)
        app.extensionBridge.requestSessionSnapshot()

        tileBack.isEnabled = primaryCanGoBack
        tileBack.alpha = if (primaryCanGoBack) 1.0f else 0.42f

        fun refreshI18nTile(enabled: Boolean) {
            tileI18n.setBackgroundResource(
                if (enabled) R.drawable.bg_quick_tile_active else R.drawable.bg_quick_tile
            )
            val color = ContextCompat.getColor(
                this,
                if (enabled) R.color.ag_primary else R.color.ag_text_secondary
            )
            tvTileI18nBadge.setTextColor(color)
            tvTileI18nLabel.setTextColor(color)
            tvTileI18nLabel.setText(if (enabled) R.string.toolbar_i18n_on else R.string.toolbar_i18n_off)
        }

        fun refreshUaTile(desktop: Boolean) {
            tileDesktopUa.setBackgroundResource(
                if (desktop) R.drawable.bg_quick_tile_active else R.drawable.bg_quick_tile
            )
            val color = ContextCompat.getColor(
                this,
                if (desktop) R.color.ag_primary else R.color.ag_text_primary
            )
            tvTileUaLabel.setTextColor(color)
            tvTileUaLabel.setText(if (desktop) R.string.toolbar_ua_desktop else R.string.toolbar_ua_mobile)
        }

        refreshI18nTile(currentSettings.i18nEnabled)
        refreshUaTile(currentSettings.desktopMode)

        tvMachineHint.text = if (UrlPolicy.isRememberableRemoteUrl(currentUrl)) {
            "当前会话：${Uri.parse(currentUrl).path ?: currentUrl}"
        } else {
            "当前页面：${UrlPolicy.extractHost(currentUrl) ?: currentUrl}"
        }

        tileHome.setOnClickListener {
            sheet.dismiss()
            closePopupSession()
            primarySession.loadUri(currentSettings.homeUrl)
        }

        tileBack.setOnClickListener {
            sheet.dismiss()
            if (primaryCanGoBack) {
                primarySession.goBack()
            }
        }

        tileReload.setOnClickListener {
            sheet.dismiss()
            if (popupContainer.visibility == View.VISIBLE) {
                popupSession?.reload()
            } else {
                primarySession.reload()
            }
        }

        tileI18n.setOnClickListener {
            val nextEnabled = !currentSettings.i18nEnabled
            currentSettings = settingsStore.setI18nEnabled(nextEnabled)
            refreshI18nTile(nextEnabled)
            app.extensionBridge.updateConfig(currentSettings)
            updateExtStatusLabel(app.extensionBridge.state)
        }

        tileDesktopUa.setOnClickListener {
            val nextDesktop = !currentSettings.desktopMode
            currentSettings = settingsStore.setDesktopMode(nextDesktop)
            refreshUaTile(nextDesktop)
            applyUserAgentMode(nextDesktop)
            sheet.dismiss()
            primarySession.reload()
        }

        tileSettings.setOnClickListener {
            sheet.dismiss()
            showSettingsDialog()
        }

        btnClearCache.setOnClickListener {
            sheet.dismiss()
            clearWebCachesPreservingCookies()
        }

        sheet.setOnDismissListener {
            if (quickMenuSheet === sheet) {
                quickMenuSheet = null
                sheetStatusView = null
                sheetTelemetryViews = null
            }
        }

        quickMenuSheet = sheet
        sheet.show()
    }

    private fun resolveStatusAppearance(status: SessionRunStatus): Triple<Int, Int, Int> {
        return when (status) {
            SessionRunStatus.RUNNING -> Triple(R.string.status_running, R.color.ag_primary, R.color.ag_primary_soft)
            SessionRunStatus.WAITING -> Triple(R.string.status_waiting, R.color.ag_warning, R.color.ag_warning_soft)
            SessionRunStatus.ERROR -> Triple(R.string.status_error, R.color.ag_error, R.color.ag_error_soft)
            SessionRunStatus.IDLE -> Triple(R.string.status_idle, R.color.ag_text_secondary, R.color.ag_idle_soft)
        }
    }

    private fun applyStatusPill(badge: TextView, status: SessionRunStatus) {
        val (labelRes, fgColorRes, bgColorRes) = resolveStatusAppearance(status)
        badge.setText(labelRes)
        badge.setTextColor(ContextCompat.getColor(this, fgColorRes))
        badge.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, bgColorRes))
    }

    private fun updateFloatingHandleTelemetry(snapshot: SessionSnapshot) {
        val ctx = snapshot.context
        if (ctx == null) {
            viewFabStatusDot.visibility = View.GONE
            tvFabCtxPct.visibility = View.GONE
            return
        }

        val dotColorRes = when (ctx.status) {
            SessionRunStatus.RUNNING -> R.color.ag_primary
            SessionRunStatus.WAITING -> R.color.ag_warning
            SessionRunStatus.ERROR -> R.color.ag_error
            SessionRunStatus.IDLE -> R.color.ag_success
        }
        viewFabStatusDot.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, dotColorRes))
        viewFabStatusDot.visibility = View.VISIBLE

        val pct = ctx.contextPct
        if (pct != null) {
            tvFabCtxPct.text = "${pct}%"
            val pctColorRes = when {
                pct >= 85 -> R.color.ag_error
                pct >= 70 -> R.color.ag_warning
                else -> R.color.ag_text_primary
            }
            tvFabCtxPct.setTextColor(ContextCompat.getColor(this, pctColorRes))
            tvFabCtxPct.visibility = View.VISIBLE
        } else {
            tvFabCtxPct.visibility = View.GONE
        }
    }

    private fun renderQuickSheetTelemetry(snapshot: SessionSnapshot) {
        val views = sheetTelemetryViews ?: return
        val ctx = snapshot.context
        if (ctx == null) {
            views.cardContextTelemetry.visibility = View.GONE
        } else {
            views.cardContextTelemetry.visibility = View.VISIBLE
            views.tvCtxModel.text = ctx.modelName.ifEmpty { "Antigravity 会话" }
            applyStatusPill(views.tvCtxStatusBadge, ctx.status)

            if (ctx.maxTokens > 0L || ctx.usedTokens > 0L) {
                views.layoutCtxUsage.visibility = View.VISIBLE
                val compactHint = if (ctx.compactedCount > 0) " · 已压缩 ${ctx.compactedCount} 次" else ""
                views.tvCtxUsageText.text = if (ctx.maxTokens > 0L) {
                    val pctValue = ctx.contextPct ?: 0
                    "Ctx ${pctValue}% · ${SessionTelemetryParser.formatCompactTokens(ctx.usedTokens)} / ${SessionTelemetryParser.formatContextLimit(ctx.maxTokens)}$compactHint"
                } else {
                    "Ctx ${SessionTelemetryParser.formatCompactTokens(ctx.usedTokens)} tokens$compactHint"
                }
                val progressPct = (ctx.contextPct ?: 0).coerceIn(0, 100)
                views.progressCtxUsage.progress = progressPct
                val barColorRes = when {
                    progressPct >= 85 -> R.color.ag_error
                    progressPct >= 70 -> R.color.ag_warning
                    else -> R.color.ag_primary
                }
                views.progressCtxUsage.progressTintList =
                    ColorStateList.valueOf(ContextCompat.getColor(this, barColorRes))
            } else {
                views.layoutCtxUsage.visibility = View.GONE
            }

            val detailParts = buildList {
                if (ctx.status == SessionRunStatus.ERROR && ctx.errorMessage.isNotEmpty()) {
                    add("异常：${ctx.errorMessage}")
                }
                if (ctx.inputTokens > 0L) {
                    add("输入 ${SessionTelemetryParser.formatCompactTokens(ctx.inputTokens)}")
                }
                if (ctx.cacheHitPct != null) {
                    add("缓存 ${ctx.cacheHitPct}%")
                }
                if (ctx.outputTokens > 0L) {
                    add("输出 ${SessionTelemetryParser.formatCompactTokens(ctx.outputTokens)}")
                }
                if (ctx.thinkingTokens > 0L) {
                    add("思考 ${SessionTelemetryParser.formatCompactTokens(ctx.thinkingTokens)}")
                }
                if (ctx.stepCount > 0) {
                    add("步数 ${ctx.stepCount}")
                }
                if (ctx.activeSubagents) {
                    add("子代理运行中")
                }
                if (ctx.backgroundCmdCount > 0) {
                    add("后台命令 ${ctx.backgroundCmdCount}")
                }
            }
            if (detailParts.isEmpty()) {
                views.tvCtxMetricsDetail.visibility = View.GONE
            } else {
                views.tvCtxMetricsDetail.text = detailParts.joinToString(" · ")
                views.tvCtxMetricsDetail.visibility = View.VISIBLE
            }
        }

        views.containerRecentConversations.removeAllViews()
        if (snapshot.recentConversations.isEmpty()) {
            views.containerRecentConversations.visibility = View.GONE
            views.tvRecentConvEmpty.visibility = View.VISIBLE
        } else {
            views.containerRecentConversations.visibility = View.VISIBLE
            views.tvRecentConvEmpty.visibility = View.GONE
            val nowMs = System.currentTimeMillis()
            for (item in snapshot.recentConversations) {
                val row = layoutInflater.inflate(
                    R.layout.item_recent_conversation,
                    views.containerRecentConversations,
                    false
                )
                row.setBackgroundResource(
                    if (item.isCurrent) R.drawable.bg_conv_item_active else R.drawable.bg_conv_item
                )
                val tvTitle = row.findViewById<TextView>(R.id.tv_conv_title)
                val tvMeta = row.findViewById<TextView>(R.id.tv_conv_meta)
                val tvStatus = row.findViewById<TextView>(R.id.tv_conv_status)

                tvTitle.text = item.title
                tvTitle.setTypeface(null, if (item.isCurrent) Typeface.BOLD else Typeface.NORMAL)

                val metaParts = buildList {
                    if (item.isCurrent) add(getString(R.string.conv_current_prefix))
                    val rel = SessionTelemetryParser.formatRelativeTime(item.lastActiveMs, nowMs)
                    if (rel.isNotEmpty()) add(rel)
                    if (item.workspaceName.isNotEmpty()) add(item.workspaceName)
                    if (item.stepCount > 0) add("${item.stepCount} 步")
                }
                if (metaParts.isEmpty()) {
                    tvMeta.visibility = View.GONE
                } else {
                    tvMeta.text = metaParts.joinToString(" · ")
                    tvMeta.visibility = View.VISIBLE
                }

                applyStatusPill(tvStatus, item.status)
                row.setOnClickListener {
                    switchToConversation(item)
                }
                views.containerRecentConversations.addView(row)
            }
        }
    }

    private fun switchToConversation(item: RecentConversationItem) {
        quickMenuSheet?.dismiss()
        if (item.isCurrent) {
            Toast.makeText(this, R.string.conv_already_current, Toast.LENGTH_SHORT).show()
            return
        }

        closePopupSession()
        clearPendingSwitchFallback()

        val requestId = "sw_${++switchCounter}"
        val fallbackRunnable = Runnable {
            if (pendingSwitchRequestId == requestId) {
                pendingSwitchRequestId = null
                pendingSwitchFallbackRunnable = null
                loadConversationUrlFallback(item.cascadeId, item.projectId)
            }
        }
        pendingSwitchRequestId = requestId
        pendingSwitchFallbackRunnable = fallbackRunnable

        val sent = app.extensionBridge.switchConversation(requestId, item.cascadeId, item.projectId)
        if (!sent) {
            clearPendingSwitchFallback()
            loadConversationUrlFallback(item.cascadeId, item.projectId)
        } else {
            mainHandler.postDelayed(fallbackRunnable, 1800L)
        }
    }

    private fun handleSwitchResultFromExtension(
        requestId: String,
        cascadeId: String,
        projectId: String,
        switched: Boolean
    ) {
        if (requestId.isNotEmpty() && pendingSwitchRequestId != null && pendingSwitchRequestId != requestId) {
            return
        }
        clearPendingSwitchFallback()
        if (!switched) {
            loadConversationUrlFallback(cascadeId, projectId)
        }
    }

    private fun clearPendingSwitchFallback() {
        pendingSwitchFallbackRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingSwitchFallbackRunnable = null
        pendingSwitchRequestId = null
    }

    private fun loadConversationUrlFallback(cascadeId: String, projectId: String) {
        val baseUrl = currentUrl.takeIf { UrlPolicy.isRememberableRemoteUrl(it) }
            ?: currentSettings.lastRemoteUrl
        val fallbackUrl = UrlPolicy.buildRemoteConversationUrl(baseUrl, cascadeId, projectId)
        if (fallbackUrl != null) {
            currentUrl = fallbackUrl
            primarySession.load(
                GeckoSession.Loader()
                    .uri(fallbackUrl)
                    .flags(GeckoSession.LOAD_FLAGS_REPLACE_HISTORY)
            )
        } else {
            Toast.makeText(this, "请先打开远程工作区后再切换会话", Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    quickMenuSheet?.isShowing == true -> {
                        quickMenuSheet?.dismiss()
                    }
                    settingsDialog?.isShowing == true -> {
                        settingsDialog?.dismiss()
                    }
                    popupContainer.visibility == View.VISIBLE -> {
                        if (popupCanGoBack) {
                            popupSession?.goBack()
                        } else {
                            closePopupSession()
                        }
                    }
                    primaryCanGoBack -> {
                        primarySession.goBack()
                    }
                    else -> {
                        // Keep GeckoSession warm in background so reopening is instant.
                        moveTaskToBack(true)
                    }
                }
            }
        })
    }

    private fun createConfiguredSession(settings: AppSettings): GeckoSession {
        return GeckoSession(app.buildSessionSettings(settings))
    }

    private fun applyUserAgentMode(desktopMode: Boolean) {
        primarySession.settings.userAgentMode = if (desktopMode) {
            GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
        } else {
            GeckoSessionSettings.USER_AGENT_MODE_MOBILE
        }
        primarySession.settings.viewportMode = if (desktopMode) {
            GeckoSessionSettings.VIEWPORT_MODE_DESKTOP
        } else {
            GeckoSessionSettings.VIEWPORT_MODE_MOBILE
        }
    }

    private fun clearWebCachesPreservingCookies() {
        runtime.storageController
            .clearData(StorageController.ClearFlags.ALL_CACHES)
            .accept(
                {
                    Toast.makeText(this, R.string.cache_cleared_toast, Toast.LENGTH_SHORT).show()
                    primarySession.reload(GeckoSession.LOAD_FLAGS_BYPASS_CACHE)
                },
                { err ->
                    Log.w(TAG, "Failed to clear caches", err)
                }
            )
    }

    private fun attachDelegates(session: GeckoSession, isPopup: Boolean) {
        session.navigationDelegate = createNavigationDelegate(isPopup)
        session.contentDelegate = createContentDelegate(isPopup)
        session.progressDelegate = createProgressDelegate(isPopup)
        session.permissionDelegate = createPermissionDelegate()
        session.promptDelegate = createPromptDelegate()
    }

    private fun createNavigationDelegate(isPopup: Boolean): NavigationDelegate {
        return object : NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<ContentPermission>,
                hasUserGesture: Boolean
            ) {
                val safeUrl = url.orEmpty()
                if (isPopup) {
                    val host = UrlPolicy.extractHost(safeUrl)
                    popupTitle.text = host ?: getString(R.string.popup_default_title)
                } else if (safeUrl.isNotBlank() && !safeUrl.startsWith("about:")) {
                    primaryHasNonBlankLocation = true
                    currentUrl = safeUrl
                    if (UrlPolicy.isRememberableRemoteUrl(safeUrl)) {
                        settingsStore.saveLastRemoteUrl(safeUrl)
                        currentSettings = currentSettings.copy(lastRemoteUrl = safeUrl)
                    }
                }
            }

            override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                if (isPopup) {
                    popupCanGoBack = canGoBack
                } else {
                    primaryCanGoBack = canGoBack
                }
            }

            override fun onLoadRequest(
                session: GeckoSession,
                request: NavigationDelegate.LoadRequest
            ): GeckoResult<AllowOrDeny> {
                val uri = request.uri
                return when (UrlPolicy.classify(uri)) {
                    UrlAction.IN_APP -> GeckoResult.allow()
                    UrlAction.EXTERNAL_BROWSER -> {
                        val openExternally = UrlPolicy.shouldOpenExternally(
                            url = uri,
                            isRedirect = request.isRedirect,
                            hasUserGesture = request.hasUserGesture,
                            isDirectNavigation = request.isDirectNavigation,
                            isPopup = isPopup
                        )
                        val host = UrlPolicy.extractHost(uri)
                        if (openExternally) {
                            Log.i(TAG, "Opening external browser for host=$host")
                            openExternalBrowser(uri)
                            GeckoResult.deny()
                        } else {
                            Log.i(
                                TAG,
                                "Keeping auth/redirect navigation in-app for host=$host (redirect=${request.isRedirect}, gesture=${request.hasUserGesture}, direct=${request.isDirectNavigation}, popup=$isPopup)"
                            )
                            GeckoResult.allow()
                        }
                    }
                    UrlAction.EXTERNAL_INTENT -> {
                        if (request.hasUserGesture || !uri.startsWith("http", ignoreCase = true)) {
                            openExternalIntent(uri)
                        }
                        GeckoResult.deny()
                    }
                    UrlAction.IGNORE -> GeckoResult.deny()
                }
            }

            override fun onNewSession(
                session: GeckoSession,
                uri: String
            ): GeckoResult<GeckoSession> {
                if (uri.isBlank() || isPopup) {
                    val newPopup = openPopupSession(uri.ifBlank { "about:blank" })
                    return GeckoResult.fromValue(newPopup)
                }
                val action = UrlPolicy.classify(uri)
                if (action == UrlAction.EXTERNAL_INTENT) {
                    openExternalIntent(uri)
                    return GeckoResult.fromValue(null)
                }
                if (action == UrlAction.IGNORE) {
                    return GeckoResult.fromValue(null)
                }

                val newPopup = openPopupSession(uri)
                return GeckoResult.fromValue(newPopup)
            }
        }
    }

    private fun createContentDelegate(isPopup: Boolean): ContentDelegate {
        return object : ContentDelegate {
            override fun onFirstContentfulPaint(session: GeckoSession) {
                if (!isPopup && primaryHasNonBlankLocation) {
                    dismissLoadingOverlay()
                }
            }

            override fun onTitleChange(session: GeckoSession, title: String?) {
                if (isPopup && !title.isNullOrBlank()) {
                    popupTitle.text = title
                }
            }

            override fun onCloseRequest(session: GeckoSession) {
                if (isPopup || session === popupSession) {
                    closePopupSession()
                }
            }

            override fun onCrash(session: GeckoSession) {
                Log.w(TAG, "GeckoSession crashed (isPopup=$isPopup); recovering")
                recoverSession(session, isPopup)
            }

            override fun onKill(session: GeckoSession) {
                Log.w(TAG, "GeckoSession killed (isPopup=$isPopup); recovering")
                recoverSession(session, isPopup)
            }
        }
    }

    private fun createProgressDelegate(isPopup: Boolean): ProgressDelegate {
        return object : ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                if (!isPopup) {
                    if (!url.startsWith("about:")) {
                        primaryHasNonBlankLocation = true
                    }
                    pageProgress.visibility = View.VISIBLE
                    pageProgress.progress = 15
                }
            }

            override fun onProgressChange(session: GeckoSession, progress: Int) {
                if (!isPopup) {
                    pageProgress.visibility = if (progress >= 100) View.GONE else View.VISIBLE
                    pageProgress.progress = progress.coerceIn(0, 100)
                    if (primaryHasNonBlankLocation && progress >= 75) {
                        dismissLoadingOverlay()
                    }
                }
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                if (!isPopup) {
                    pageProgress.visibility = View.GONE
                    if (primaryHasNonBlankLocation) {
                        dismissLoadingOverlay()
                    }
                }
            }
        }
    }

    private fun createPermissionDelegate(): PermissionDelegate {
        return object : PermissionDelegate {
            override fun onAndroidPermissionsRequest(
                session: GeckoSession,
                permissions: Array<out String>?,
                callback: PermissionDelegate.Callback
            ) {
                val requested = permissions?.filter { it.isNotBlank() }.orEmpty()
                if (requested.isEmpty()) {
                    callback.grant()
                    return
                }
                val missing = requested.filter { perm ->
                    ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        perm
                    ) != PackageManager.PERMISSION_GRANTED
                }
                if (missing.isEmpty()) {
                    callback.grant()
                    return
                }
                pendingAndroidPermissionCallback?.reject()
                pendingAndroidPermissionCallback = callback
                requestMultiplePermissionsLauncher.launch(missing.toTypedArray())
            }

            override fun onContentPermissionRequest(
                session: GeckoSession,
                perm: ContentPermission
            ): GeckoResult<Int> {
                val allowedOrigin = UrlPolicy.classify(perm.uri) == UrlAction.IN_APP
                when (perm.permission) {
                    PermissionDelegate.PERMISSION_DESKTOP_NOTIFICATION -> {
                        if (!allowedOrigin) {
                            return GeckoResult.fromValue(ContentPermission.VALUE_DENY)
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                            ContextCompat.checkSelfPermission(
                                this@MainActivity,
                                Manifest.permission.POST_NOTIFICATIONS
                            ) != PackageManager.PERMISSION_GRANTED
                        ) {
                            pendingNotificationPermissionResult?.complete(ContentPermission.VALUE_DENY)
                            val result = GeckoResult<Int>()
                            pendingNotificationPermissionResult = result
                            requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            return result
                        }
                        return GeckoResult.fromValue(ContentPermission.VALUE_ALLOW)
                    }
                    PermissionDelegate.PERMISSION_PERSISTENT_STORAGE,
                    PermissionDelegate.PERMISSION_STORAGE_ACCESS,
                    PermissionDelegate.PERMISSION_AUTOPLAY_INAUDIBLE,
                    PermissionDelegate.PERMISSION_AUTOPLAY_AUDIBLE -> {
                        return GeckoResult.fromValue(
                            if (allowedOrigin) ContentPermission.VALUE_ALLOW else ContentPermission.VALUE_DENY
                        )
                    }
                    PermissionDelegate.PERMISSION_GEOLOCATION,
                    PermissionDelegate.PERMISSION_LOCAL_NETWORK_ACCESS,
                    PermissionDelegate.PERMISSION_LOCAL_DEVICE_ACCESS,
                    PermissionDelegate.PERMISSION_MEDIA_KEY_SYSTEM_ACCESS -> {
                        val result = GeckoResult<Int>()
                        val host = UrlPolicy.extractHost(perm.uri) ?: perm.uri
                        MaterialAlertDialogBuilder(this@MainActivity)
                            .setTitle("权限请求")
                            .setMessage("网站 $host 请求访问受保护能力，是否允许？")
                            .setPositiveButton("允许") { _, _ ->
                                result.complete(ContentPermission.VALUE_ALLOW)
                            }
                            .setNegativeButton("拒绝") { _, _ ->
                                result.complete(ContentPermission.VALUE_DENY)
                            }
                            .setOnCancelListener {
                                result.complete(ContentPermission.VALUE_DENY)
                            }
                            .show()
                        return result
                    }
                    else -> return GeckoResult.fromValue(ContentPermission.VALUE_DENY)
                }
            }

            override fun onMediaPermissionRequest(
                session: GeckoSession,
                uri: String,
                video: Array<out PermissionDelegate.MediaSource>?,
                audio: Array<out PermissionDelegate.MediaSource>?,
                callback: PermissionDelegate.MediaCallback
            ) {
                val host = UrlPolicy.extractHost(uri) ?: uri
                val mediaTypes = buildList {
                    if (!audio.isNullOrEmpty()) add("麦克风")
                    if (!video.isNullOrEmpty()) add("摄像头")
                }.joinToString(" / ").ifEmpty { "媒体设备" }

                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle("媒体权限请求")
                    .setMessage("$host 请求使用$mediaTypes，是否允许？")
                    .setPositiveButton("允许") { _, _ ->
                        callback.grant(video?.firstOrNull(), audio?.firstOrNull())
                    }
                    .setNegativeButton("拒绝") { _, _ ->
                        callback.reject()
                    }
                    .setOnCancelListener {
                        callback.reject()
                    }
                    .show()
            }
        }
    }

    private fun createPromptDelegate(): PromptDelegate {
        return object : PromptDelegate {
            override fun onFilePrompt(
                session: GeckoSession,
                prompt: PromptDelegate.FilePrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                pendingFilePrompt?.let { stale ->
                    pendingFileResult?.complete(stale.dismiss())
                }
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                pendingFilePrompt = prompt
                pendingFileResult = result

                val mimeTypes = sanitizeMimeTypes(prompt.mimeTypes)

                try {
                    if (prompt.type == PromptDelegate.FilePrompt.Type.MULTIPLE) {
                        openMultipleDocumentsLauncher.launch(mimeTypes)
                    } else {
                        openDocumentLauncher.launch(mimeTypes)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Unable to open document picker", e)
                    pendingFilePrompt = null
                    pendingFileResult = null
                    result.complete(prompt.dismiss())
                }
                return result
            }

            override fun onAlertPrompt(
                session: GeckoSession,
                prompt: PromptDelegate.AlertPrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle(prompt.title?.ifBlank { getString(R.string.app_name) } ?: getString(R.string.app_name))
                    .setMessage(prompt.message.orEmpty())
                    .setPositiveButton("确定") { _, _ -> result.complete(prompt.dismiss()) }
                    .setOnCancelListener { result.complete(prompt.dismiss()) }
                    .show()
                return result
            }

            override fun onButtonPrompt(
                session: GeckoSession,
                prompt: PromptDelegate.ButtonPrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle(prompt.title?.ifBlank { "确认操作" } ?: "确认操作")
                    .setMessage(prompt.message.orEmpty())
                    .setPositiveButton("确定") { _, _ ->
                        result.complete(prompt.confirm(PromptDelegate.ButtonPrompt.Type.POSITIVE))
                    }
                    .setNegativeButton("取消") { _, _ ->
                        result.complete(prompt.confirm(PromptDelegate.ButtonPrompt.Type.NEGATIVE))
                    }
                    .setOnCancelListener { result.complete(prompt.dismiss()) }
                    .show()
                return result
            }

            override fun onTextPrompt(
                session: GeckoSession,
                prompt: PromptDelegate.TextPrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                val input = EditText(this@MainActivity).apply {
                    setText(prompt.defaultValue.orEmpty())
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.ag_text_primary))
                }
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle(prompt.title?.ifBlank { "输入内容" } ?: "输入内容")
                    .setMessage(prompt.message.orEmpty())
                    .setView(input)
                    .setPositiveButton("确定") { _, _ ->
                        result.complete(prompt.confirm(input.text.toString()))
                    }
                    .setNegativeButton("取消") { _, _ -> result.complete(prompt.dismiss()) }
                    .setOnCancelListener { result.complete(prompt.dismiss()) }
                    .show()
                return result
            }

            override fun onChoicePrompt(
                session: GeckoSession,
                prompt: PromptDelegate.ChoicePrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                val choices = prompt.choices.orEmpty()
                if (choices.isEmpty()) {
                    return GeckoResult.fromValue(prompt.dismiss())
                }
                val labels = choices.map { it.label.orEmpty() }.toTypedArray()

                if (prompt.type == PromptDelegate.ChoicePrompt.Type.MULTIPLE) {
                    val checked = BooleanArray(choices.size) { choices[it].selected }
                    MaterialAlertDialogBuilder(this@MainActivity)
                        .setTitle(prompt.title?.ifBlank { "请选择" } ?: "请选择")
                        .setMultiChoiceItems(labels, checked) { _, which, isChecked ->
                            checked[which] = isChecked
                        }
                        .setPositiveButton("确定") { _, _ ->
                            val selected = choices.filterIndexed { index, _ -> checked[index] }
                                .toTypedArray()
                            result.complete(prompt.confirm(selected))
                        }
                        .setNegativeButton("取消") { _, _ -> result.complete(prompt.dismiss()) }
                        .setOnCancelListener { result.complete(prompt.dismiss()) }
                        .show()
                } else {
                    val initialIdx = choices.indexOfFirst { it.selected }.coerceAtLeast(-1)
                    MaterialAlertDialogBuilder(this@MainActivity)
                        .setTitle(prompt.title?.ifBlank { "请选择" } ?: "请选择")
                        .setSingleChoiceItems(labels, initialIdx) { dialog, which ->
                            dialog.dismiss()
                            result.complete(prompt.confirm(choices[which]))
                        }
                        .setNegativeButton("取消") { _, _ -> result.complete(prompt.dismiss()) }
                        .setOnCancelListener { result.complete(prompt.dismiss()) }
                        .show()
                }
                return result
            }

            override fun onAuthPrompt(
                session: GeckoSession,
                prompt: PromptDelegate.AuthPrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                val onlyPassword =
                    (prompt.authOptions.flags and PromptDelegate.AuthPrompt.AuthOptions.Flags.ONLY_PASSWORD) != 0

                val container = LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(48, 24, 48, 8)
                }
                val userInput = EditText(this@MainActivity).apply {
                    hint = "用户名"
                    setText(prompt.authOptions.username.orEmpty())
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.ag_text_primary))
                    visibility = if (onlyPassword) View.GONE else View.VISIBLE
                }
                val passInput = EditText(this@MainActivity).apply {
                    hint = "密码"
                    inputType =
                        android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
                    setText(prompt.authOptions.password.orEmpty())
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.ag_text_primary))
                }
                container.addView(userInput)
                container.addView(passInput)

                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle(prompt.title?.ifBlank { "身份验证" } ?: "身份验证")
                    .setMessage(prompt.message.orEmpty())
                    .setView(container)
                    .setPositiveButton("登录") { _, _ ->
                        val response = if (onlyPassword) {
                            prompt.confirm(passInput.text.toString())
                        } else {
                            prompt.confirm(userInput.text.toString(), passInput.text.toString())
                        }
                        result.complete(response)
                    }
                    .setNegativeButton("取消") { _, _ -> result.complete(prompt.dismiss()) }
                    .setOnCancelListener { result.complete(prompt.dismiss()) }
                    .show()
                return result
            }

            override fun onBeforeUnloadPrompt(
                session: GeckoSession,
                prompt: PromptDelegate.BeforeUnloadPrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle("离开页面确认")
                    .setMessage("当前页面有未保存的更改，确定要离开吗？")
                    .setPositiveButton("离开") { _, _ -> result.complete(prompt.confirm(AllowOrDeny.ALLOW)) }
                    .setNegativeButton("留下") { _, _ -> result.complete(prompt.confirm(AllowOrDeny.DENY)) }
                    .setOnCancelListener { result.complete(prompt.dismiss()) }
                    .show()
                return result
            }

            override fun onRepostConfirmPrompt(
                session: GeckoSession,
                prompt: PromptDelegate.RepostConfirmPrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val result = GeckoResult<PromptDelegate.PromptResponse>()
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle("重新提交表单")
                    .setMessage("刷新页面将重新发送先前提交的数据，是否继续？")
                    .setPositiveButton("继续") { _, _ -> result.complete(prompt.confirm(AllowOrDeny.ALLOW)) }
                    .setNegativeButton("取消") { _, _ -> result.complete(prompt.confirm(AllowOrDeny.DENY)) }
                    .setOnCancelListener { result.complete(prompt.dismiss()) }
                    .show()
                return result
            }

            override fun onPopupPrompt(
                session: GeckoSession,
                prompt: PromptDelegate.PopupPrompt
            ): GeckoResult<PromptDelegate.PromptResponse> {
                val targetUri = prompt.targetUri
                val action = UrlPolicy.classify(targetUri)
                val allow = targetUri.isNullOrBlank() ||
                    action == UrlAction.IN_APP ||
                    action == UrlAction.EXTERNAL_BROWSER
                return GeckoResult.fromValue(
                    prompt.confirm(if (allow) AllowOrDeny.ALLOW else AllowOrDeny.DENY)
                )
            }
        }
    }

    private fun openPopupSession(initialUri: String): GeckoSession {
        closePopupSession()
        val session = createConfiguredSession(currentSettings)
        attachDelegates(session, isPopup = true)
        session.open(runtime)
        popupSession = session
        popupCanGoBack = false
        popupTitle.text = UrlPolicy.extractHost(initialUri) ?: getString(R.string.popup_default_title)
        popupGeckoView.setSession(session)
        popupContainer.visibility = View.VISIBLE
        return session
    }

    private fun closePopupSession() {
        val session = popupSession
        popupSession = null
        popupCanGoBack = false
        popupContainer.visibility = View.GONE
        popupGeckoView.releaseSession()
        if (session != null && session.isOpen) {
            session.close()
        }
    }

    private fun recoverSession(crashedSession: GeckoSession, isPopup: Boolean) {
        if (isPopup) {
            closePopupSession()
            Toast.makeText(this, "弹窗会话已重置", Toast.LENGTH_SHORT).show()
            return
        }
        geckoView.releaseSession()
        if (crashedSession.isOpen) {
            crashedSession.close()
        }
        primarySession = createConfiguredSession(currentSettings)
        attachDelegates(primarySession, isPopup = false)
        primarySession.setPriorityHint(GeckoSession.PRIORITY_HIGH)
        primarySession.open(runtime)
        geckoView.setSession(primarySession)
        primarySession.loadUri(currentUrl)
        Toast.makeText(this, "页面渲染进程已自动恢复", Toast.LENGTH_SHORT).show()
    }

    private fun showSettingsDialog() {
        settingsDialog?.dismiss()

        val view = layoutInflater.inflate(R.layout.dialog_settings, null)
        val tvExtStatus = view.findViewById<TextView>(R.id.tv_ext_status)
        val etHomeUrl = view.findViewById<EditText>(R.id.et_home_url)
        val btnResetUrl = view.findViewById<TextView>(R.id.btn_reset_url)
        val switchI18n = view.findViewById<SwitchCompat>(R.id.switch_i18n)
        val switchDesktopUa = view.findViewById<SwitchCompat>(R.id.switch_desktop_ua)
        val switchKeepAwake = view.findViewById<SwitchCompat>(R.id.switch_keep_awake)
        val switchRememberRemote = view.findViewById<SwitchCompat>(R.id.switch_remember_remote)
        val switchAutoReconnect = view.findViewById<SwitchCompat>(R.id.switch_auto_reconnect)
        val etCustomDict = view.findViewById<EditText>(R.id.et_custom_dict)
        val btnFormatJson = view.findViewById<TextView>(R.id.btn_format_json)
        val tvDictValidation = view.findViewById<TextView>(R.id.tv_dict_validation)
        val btnClearCache = view.findViewById<Button>(R.id.btn_clear_cache)

        settingsExtStatusView = tvExtStatus
        updateExtStatusLabel(app.extensionBridge.state)

        etHomeUrl.setText(currentSettings.homeUrl)
        switchI18n.isChecked = currentSettings.i18nEnabled
        switchDesktopUa.isChecked = currentSettings.desktopMode
        switchKeepAwake.isChecked = currentSettings.keepScreenOn
        switchRememberRemote.isChecked = currentSettings.rememberLastRemote
        switchAutoReconnect.isChecked = currentSettings.autoReconnectOnResume
        etCustomDict.setText(currentSettings.customDictJson)

        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle(R.string.settings_title)
            .setView(view)
            .setPositiveButton(R.string.settings_save, null)
            .setNegativeButton(R.string.settings_cancel, null)
            .create()

        fun refreshJsonValidation(rawText: String): CustomDictParseResult {
            val res = SettingsStore.parseCustomDictJson(rawText)
            if (res.isValid) {
                tvDictValidation.setTextColor(ContextCompat.getColor(this, R.color.ag_success))
                tvDictValidation.text = "✓ JSON 格式有效（共 ${res.entries.size} 条自定义词条）"
                dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.isEnabled = true
            } else {
                tvDictValidation.setTextColor(ContextCompat.getColor(this, R.color.ag_error))
                tvDictValidation.text = "✗ ${res.errorMessage ?: "JSON 格式无效"}"
                dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.isEnabled = false
            }
            return res
        }

        etCustomDict.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                refreshJsonValidation(s?.toString().orEmpty())
            }
        })

        btnResetUrl.setOnClickListener {
            etHomeUrl.setText(UrlPolicy.DEFAULT_HOME_URL)
        }

        btnFormatJson.setOnClickListener {
            val parsed = SettingsStore.parseCustomDictJson(etCustomDict.text.toString())
            if (parsed.isValid) {
                etCustomDict.setText(CustomDictJsonParser.serialize(parsed.entries, pretty = true))
            } else {
                refreshJsonValidation(etCustomDict.text.toString())
            }
        }

        btnClearCache.setOnClickListener {
            clearWebCachesPreservingCookies()
        }

        dialog.setOnShowListener {
            refreshJsonValidation(etCustomDict.text.toString())
            dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.setOnClickListener {
                val dictText = etCustomDict.text.toString()
                val dictResult = refreshJsonValidation(dictText)
                if (!dictResult.isValid) {
                    return@setOnClickListener
                }

                val previous = currentSettings
                val updated = settingsStore.save(
                    previous.copy(
                        homeUrl = etHomeUrl.text.toString(),
                        i18nEnabled = switchI18n.isChecked,
                        desktopMode = switchDesktopUa.isChecked,
                        keepScreenOn = switchKeepAwake.isChecked,
                        rememberLastRemote = switchRememberRemote.isChecked,
                        autoReconnectOnResume = switchAutoReconnect.isChecked,
                        customDictJson = dictResult.normalizedJson,
                        customDict = dictResult.entries
                    )
                )
                currentSettings = updated
                applyKeepScreenOn(updated.keepScreenOn)
                app.extensionBridge.updateConfig(updated)

                if (updated.desktopMode != previous.desktopMode) {
                    applyUserAgentMode(updated.desktopMode)
                    primarySession.reload()
                }
                if (updated.homeUrl != previous.homeUrl) {
                    currentUrl = updated.homeUrl
                    primarySession.loadUri(updated.homeUrl)
                }

                dialog.dismiss()
            }
        }

        dialog.setOnDismissListener {
            if (settingsDialog === dialog) {
                settingsDialog = null
                settingsExtStatusView = null
            }
        }

        settingsDialog = dialog
        dialog.show()
    }

    private fun updateExtStatusLabel(state: BridgeState) {
        val text = when {
            state.ready -> "汉化已就绪 v${state.version ?: "1.1.0"} · 已译 ${state.translatedCount} 处"
            state.connected -> "汉化插件：已连接，初始化中..."
            else -> "汉化插件：等待端口连接..."
        }
        settingsExtStatusView?.text = "插件状态：$text"
        sheetStatusView?.text = if (currentSettings.i18nEnabled) text else "英文原版 · 插件已就绪"
    }

    private fun applyKeepScreenOn(keepOn: Boolean) {
        if (keepOn) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    private fun sanitizeMimeTypes(rawTypes: Array<out String>?): Array<String> {
        if (rawTypes.isNullOrEmpty()) return arrayOf("*/*")
        val mimeMap = MimeTypeMap.getSingleton()
        val resolved = linkedSetOf<String>()
        for (entry in rawTypes) {
            val trimmed = entry.trim()
            if (trimmed.isEmpty()) continue
            if (trimmed.contains('/')) {
                resolved.add(trimmed)
            } else if (trimmed.startsWith('.')) {
                val ext = trimmed.substring(1).lowercase()
                val mime = mimeMap.getMimeTypeFromExtension(ext)
                if (!mime.isNullOrBlank()) {
                    resolved.add(mime)
                } else {
                    return arrayOf("*/*")
                }
            } else {
                return arrayOf("*/*")
            }
        }
        return if (resolved.isEmpty()) arrayOf("*/*") else resolved.toTypedArray()
    }

    private fun extractDeepLinkUrl(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val uriString = intent.data?.toString() ?: return null
        return if (UrlPolicy.classify(uriString) == UrlAction.IN_APP) uriString else null
    }

    private fun openExternalBrowser(url: String) {
        try {
            val viewIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
            }
            startActivity(viewIntent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.external_browser_error, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to launch external browser for $url", e)
        }
    }

    private fun openExternalIntent(url: String) {
        try {
            if (url.startsWith("intent:", ignoreCase = true)) {
                val parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                try {
                    startActivity(parsed)
                    return
                } catch (_: ActivityNotFoundException) {
                    val fallbackUrl = parsed.getStringExtra("browser_fallback_url")
                    if (!fallbackUrl.isNullOrBlank()) {
                        when (UrlPolicy.classify(fallbackUrl)) {
                            UrlAction.IN_APP -> primarySession.loadUri(fallbackUrl)
                            UrlAction.EXTERNAL_BROWSER -> openExternalBrowser(fallbackUrl)
                            else -> Unit
                        }
                    }
                }
                return
            }
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.external_browser_error, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to handle external intent URI safely: $url", e)
        }
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
