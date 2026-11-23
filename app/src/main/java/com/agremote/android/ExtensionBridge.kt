package com.agremote.android

import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.WebExtension
import java.util.concurrent.CopyOnWriteArraySet

data class BridgeState(
    val connected: Boolean = false,
    val ready: Boolean = false,
    val version: String? = null,
    val translatedCount: Int = 0
)

class ExtensionBridge {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArraySet<(BridgeState) -> Unit>()
    private val snapshotListeners = CopyOnWriteArraySet<(SessionSnapshot) -> Unit>()

    @Volatile
    private var activePort: WebExtension.Port? = null

    @Volatile
    private var currentEnabled: Boolean = true

    @Volatile
    private var currentCustomDict: Map<String, String> = emptyMap()

    @Volatile
    var state: BridgeState = BridgeState()
        private set

    @Volatile
    var latestSnapshot: SessionSnapshot = SessionSnapshot()
        private set

    @Volatile
    var onStreamStalledListener: ((hasDraft: Boolean, backgroundMs: Long) -> Unit)? = null

    @Volatile
    var onSwitchResultListener: ((requestId: String, cascadeId: String, projectId: String, switched: Boolean) -> Unit)? = null

    fun addListener(listener: (BridgeState) -> Unit) {
        listeners.add(listener)
        mainHandler.post { listener(state) }
    }

    fun removeListener(listener: (BridgeState) -> Unit) {
        listeners.remove(listener)
    }

    fun addSnapshotListener(listener: (SessionSnapshot) -> Unit) {
        snapshotListeners.add(listener)
        mainHandler.post { listener(latestSnapshot) }
    }

    fun removeSnapshotListener(listener: (SessionSnapshot) -> Unit) {
        snapshotListeners.remove(listener)
    }

    fun attachExtension(extension: WebExtension) {
        val attachBlock = Runnable {
            extension.setMessageDelegate(messageDelegate, NATIVE_APP_NAME)
            Log.i(TAG, "Attached WebExtension message delegate for ${extension.id}")
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            attachBlock.run()
        } else {
            mainHandler.post(attachBlock)
        }
    }

    fun updateConfig(settings: AppSettings) {
        updateConfig(settings.i18nEnabled, settings.customDict)
    }

    fun updateConfig(enabled: Boolean, customDict: Map<String, String>) {
        currentEnabled = enabled
        currentCustomDict = LinkedHashMap(customDict)
        pushConfigToActivePort()
    }

    fun pushConfigToActivePort() {
        mainHandler.post {
            val port = activePort ?: return@post
            try {
                port.postMessage(buildConfigPayload())
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to post CONFIG_UPDATE to native port", t)
                if (activePort === port) {
                    activePort = null
                    updateState { it.copy(connected = false, ready = false) }
                }
            }
        }
    }

    fun sendAppResumed(backgroundMs: Long) {
        mainHandler.post {
            val port = activePort ?: return@post
            try {
                val payload = JSONObject().apply {
                    put("type", "APP_RESUMED")
                    put("backgroundMs", backgroundMs.coerceAtLeast(0L))
                }
                port.postMessage(payload)
                Log.i(TAG, "Sent APP_RESUMED (backgroundMs=$backgroundMs)")
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to post APP_RESUMED to native port", t)
            }
        }
    }

    fun requestSessionSnapshot() {
        mainHandler.post {
            val port = activePort ?: return@post
            try {
                port.postMessage(JSONObject().apply { put("type", "REQUEST_SNAPSHOT") })
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to post REQUEST_SNAPSHOT to native port", t)
            }
        }
    }

    fun resetSessionState() {
        val cleared = SessionSnapshot()
        latestSnapshot = cleared
        mainHandler.post {
            for (listener in snapshotListeners) {
                listener(cleared)
            }
        }
    }

    fun switchConversation(requestId: String, cascadeId: String, projectId: String): Boolean {
        val port = activePort ?: return false
        mainHandler.post {
            val currentPort = activePort ?: port
            try {
                val payload = JSONObject().apply {
                    put("type", "SWITCH_CONVERSATION")
                    put("requestId", requestId)
                    put("cascadeId", cascadeId)
                    put("projectId", projectId)
                }
                currentPort.postMessage(payload)
                Log.i(TAG, "Sent SWITCH_CONVERSATION requestId=$requestId")
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to post SWITCH_CONVERSATION to native port", t)
                onSwitchResultListener?.invoke(requestId, cascadeId, projectId, false)
            }
        }
        return true
    }

    private fun buildConfigPayload(): JSONObject {
        val dictJson = JSONObject()
        for ((key, value) in currentCustomDict) {
            dictJson.put(key, value)
        }
        return JSONObject().apply {
            put("type", "CONFIG_UPDATE")
            put("enabled", currentEnabled)
            put("customDict", dictJson)
        }
    }

    private fun handleIncomingMessage(rawMessage: Any?, replyPort: WebExtension.Port?) {
        val json = when (rawMessage) {
            is JSONObject -> rawMessage
            is String -> runCatching { JSONObject(rawMessage) }.getOrNull()
            else -> null
        } ?: return

        when (json.optString("type")) {
            "READY" -> {
                val version = json.optString("version", "1.1.1").ifBlank { "1.1.1" }
                Log.i(TAG, "WebExtension READY version=$version")
                updateState { it.copy(connected = true, ready = true, version = version) }
                if (replyPort != null) {
                    try {
                        replyPort.postMessage(buildConfigPayload())
                    } catch (t: Throwable) {
                        Log.w(TAG, "Failed to reply CONFIG_UPDATE after READY", t)
                    }
                }
            }
            "STATS" -> {
                val count = json.optInt("translatedCount", 0).coerceAtLeast(0)
                Log.i(TAG, "WebExtension STATS translatedCount=$count")
                updateState { it.copy(translatedCount = count) }
            }
            "STREAM_STALLED" -> {
                val hasDraft = json.optBoolean("hasDraft", false)
                val backgroundMs = json.optLong("backgroundMs", 0L).coerceAtLeast(0L)
                Log.i(TAG, "WebExtension STREAM_STALLED hasDraft=$hasDraft backgroundMs=$backgroundMs")
                mainHandler.post {
                    onStreamStalledListener?.invoke(hasDraft, backgroundMs)
                }
            }
            "SESSION_SNAPSHOT" -> {
                val parsed = SessionTelemetryParser.parseSnapshot(json)
                val previousRecents = latestSnapshot.recentConversations
                val mergedRecents = if (parsed.recentConversations.isEmpty() && previousRecents.isNotEmpty()) {
                    val cid = parsed.currentConversationId
                    previousRecents.map { item ->
                        item.copy(isCurrent = cid.isNotEmpty() && item.cascadeId == cid)
                    }
                } else {
                    parsed.recentConversations
                }
                val merged = parsed.copy(recentConversations = mergedRecents)
                latestSnapshot = merged
                val meta = json.optJSONObject("probeMeta")
                Log.i(
                    TAG,
                    "WebExtension SESSION_SNAPSHOT recents=${merged.recentConversations.size} hasCtx=${merged.context != null} pct=${merged.context?.contextPct} status=${merged.context?.status} store=${meta?.optBoolean("hasStore")} router=${meta?.optBoolean("hasRouter")} asp=${meta?.optBoolean("hasAsp")} summaries=${meta?.optInt("summaryCount")}"
                )
                mainHandler.post {
                    for (listener in snapshotListeners) {
                        listener(merged)
                    }
                }
            }
            "SWITCH_RESULT" -> {
                val requestId = json.optString("requestId", "")
                val cascadeId = json.optString("cascadeId", "")
                val projectId = json.optString("projectId", "")
                val switched = json.optBoolean("switched", false)
                val err = json.optString("error", "")
                val errSuffix = if (err.isNotEmpty()) " err=$err" else ""
                Log.i(
                    TAG,
                    "WebExtension SWITCH_RESULT requestId=$requestId switched=$switched method=${json.optString("method")}$errSuffix"
                )
                mainHandler.post {
                    onSwitchResultListener?.invoke(requestId, cascadeId, projectId, switched)
                }
            }
        }
    }

    private fun updateState(transform: (BridgeState) -> BridgeState) {
        val next = transform(state)
        state = next
        mainHandler.post {
            for (listener in listeners) {
                listener(next)
            }
        }
    }

    private val portDelegate = object : WebExtension.PortDelegate {
        override fun onPortMessage(message: Any, port: WebExtension.Port) {
            handleIncomingMessage(message, port)
        }

        override fun onDisconnect(port: WebExtension.Port) {
            if (activePort === port) {
                activePort = null
                updateState { it.copy(connected = false, ready = false) }
            }
        }
    }

    private val messageDelegate = object : WebExtension.MessageDelegate {
        override fun onConnect(port: WebExtension.Port) {
            Log.i(TAG, "Native port connected: ${port.name}")
            activePort = port
            port.setDelegate(portDelegate)
            updateState { it.copy(connected = true) }
            try {
                port.postMessage(buildConfigPayload())
            } catch (t: Throwable) {
                Log.w(TAG, "Failed initial CONFIG_UPDATE on port connect", t)
            }
        }

        override fun onMessage(
            nativeApp: String,
            message: Any,
            sender: WebExtension.MessageSender
        ): GeckoResult<Any>? {
            if (nativeApp != NATIVE_APP_NAME) return null
            handleIncomingMessage(message, null)
            return GeckoResult.fromValue(buildConfigPayload())
        }
    }

    companion object {
        private const val TAG = "ExtensionBridge"
        const val EXTENSION_URI = "resource://android/assets/i18n_zh_ext/"
        const val EXTENSION_ID = "ag-remote-zh@agremote.local"
        const val NATIVE_APP_NAME = "ag_remote_i18n"
    }
}
