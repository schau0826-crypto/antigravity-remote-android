package com.agremote.android

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import kotlin.math.roundToLong

enum class SessionRunStatus {
    IDLE,
    RUNNING,
    WAITING,
    ERROR;

    companion object {
        fun fromWire(raw: String?): SessionRunStatus {
            return when (raw?.trim()?.lowercase(Locale.ROOT)) {
                "running" -> RUNNING
                "waiting" -> WAITING
                "error" -> ERROR
                else -> IDLE
            }
        }
    }
}

data class RecentConversationItem(
    val cascadeId: String,
    val title: String,
    val projectId: String = "",
    val workspaceName: String = "",
    val status: SessionRunStatus = SessionRunStatus.IDLE,
    val stepCount: Int = 0,
    val lastActiveMs: Long = 0L,
    val isCurrent: Boolean = false
)

data class ContextTelemetry(
    val status: SessionRunStatus = SessionRunStatus.IDLE,
    val modelName: String = "",
    val usedTokens: Long = 0L,
    val maxTokens: Long = 0L,
    val contextPct: Int? = null,
    val inputTokens: Long = 0L,
    val cacheReadTokens: Long = 0L,
    val outputTokens: Long = 0L,
    val thinkingTokens: Long = 0L,
    val cacheHitPct: Int? = null,
    val generationCount: Int = 0,
    val stepCount: Int = 0,
    val compactedCount: Int = 0,
    val activeSubagents: Boolean = false,
    val backgroundCmdCount: Int = 0,
    val errorMessage: String = ""
)

data class SessionSnapshot(
    val currentConversationId: String = "",
    val context: ContextTelemetry? = null,
    val recentConversations: List<RecentConversationItem> = emptyList(),
    val updatedAtMs: Long = 0L,
    val hasStore: Boolean = false
)

object SessionTelemetryParser {
    private const val MAX_RECENT_CONVERSATIONS = 5

    fun parseSnapshot(json: JSONObject): SessionSnapshot {
        val currentCid = json.optString("currentConversationId", "")?.trim().orEmpty()
        val ctxObj = json.optJSONObject("context")
        val context = if (ctxObj != null) parseContext(ctxObj) else null
        val recents = parseRecentConversations(json.optJSONArray("recentConversations"))
        val updatedAtMs = json.optLong("updatedAtMs", 0L).coerceAtLeast(0L)
        val hasStore = json.optJSONObject("probeMeta")?.optBoolean("hasStore", false) ?: false
        return SessionSnapshot(
            currentConversationId = currentCid,
            context = context,
            recentConversations = recents,
            updatedAtMs = updatedAtMs,
            hasStore = hasStore
        )
    }

    private fun parseContext(obj: JSONObject): ContextTelemetry {
        val contextPct = if (obj.has("contextPct") && !obj.isNull("contextPct")) {
            obj.optInt("contextPct", 0).coerceIn(0, 100)
        } else {
            null
        }
        val cacheHitPct = if (obj.has("cacheHitPct") && !obj.isNull("cacheHitPct")) {
            obj.optInt("cacheHitPct", 0).coerceIn(0, 100)
        } else {
            null
        }
        return ContextTelemetry(
            status = SessionRunStatus.fromWire(obj.optString("status", "idle")),
            modelName = obj.optString("modelName", "").trim(),
            usedTokens = obj.optLong("usedTokens", 0L).coerceAtLeast(0L),
            maxTokens = obj.optLong("maxTokens", 0L).coerceAtLeast(0L),
            contextPct = contextPct,
            inputTokens = obj.optLong("inputTokens", 0L).coerceAtLeast(0L),
            cacheReadTokens = obj.optLong("cacheReadTokens", 0L).coerceAtLeast(0L),
            outputTokens = obj.optLong("outputTokens", 0L).coerceAtLeast(0L),
            thinkingTokens = obj.optLong("thinkingTokens", 0L).coerceAtLeast(0L),
            cacheHitPct = cacheHitPct,
            generationCount = obj.optInt("generationCount", 0).coerceAtLeast(0),
            stepCount = obj.optInt("stepCount", 0).coerceAtLeast(0),
            compactedCount = obj.optInt("compactedCount", 0).coerceAtLeast(0),
            activeSubagents = obj.optBoolean("activeSubagents", false),
            backgroundCmdCount = obj.optInt("backgroundCmdCount", 0).coerceAtLeast(0),
            errorMessage = obj.optString("errorMessage", "").trim()
        )
    }

    private fun parseRecentConversations(array: JSONArray?): List<RecentConversationItem> {
        if (array == null || array.length() == 0) {
            return emptyList()
        }
        val list = ArrayList<RecentConversationItem>(minOf(array.length(), MAX_RECENT_CONVERSATIONS))
        for (i in 0 until array.length()) {
            if (list.size >= MAX_RECENT_CONVERSATIONS) break
            val itemObj = array.optJSONObject(i) ?: continue
            val cascadeId = itemObj.optString("cascadeId", "").trim()
            if (cascadeId.isEmpty()) continue
            val title = itemObj.optString("title", "").trim().ifEmpty { "未命名对话" }
            list.add(
                RecentConversationItem(
                    cascadeId = cascadeId,
                    title = title,
                    projectId = itemObj.optString("projectId", "").trim(),
                    workspaceName = itemObj.optString("workspaceName", "").trim(),
                    status = SessionRunStatus.fromWire(itemObj.optString("status", "idle")),
                    stepCount = itemObj.optInt("stepCount", 0).coerceAtLeast(0),
                    lastActiveMs = itemObj.optLong("lastActiveMs", 0L).coerceAtLeast(0L),
                    isCurrent = itemObj.optBoolean("isCurrent", false)
                )
            )
        }
        return list
    }

    fun formatCompactTokens(tokens: Long): String {
        if (tokens <= 0L) return "0"
        if (tokens >= 1_000_000L) {
            return String.format(Locale.US, "%.2fM", tokens / 1_000_000.0)
        }
        if (tokens >= 10_000L) {
            return "${(tokens / 1_000.0).roundToLong()}k"
        }
        if (tokens >= 1_000L) {
            return String.format(Locale.US, "%.1fk", tokens / 1_000.0)
        }
        return tokens.toString()
    }

    fun formatContextLimit(tokens: Long): String {
        if (tokens <= 0L) return "0k"
        if (tokens >= 1_000_000L) {
            if (tokens == 1_000_000L || tokens == 1_048_576L) {
                return "1M"
            }
            val formatted = String.format(Locale.US, "%.2f", tokens / 1_000_000.0)
                .replace(Regex("\\.?0+$"), "")
            return "${formatted}M"
        }
        return "${(tokens / 1_000.0).roundToLong()}k"
    }

    fun formatRelativeTime(lastActiveMs: Long, nowMs: Long = System.currentTimeMillis()): String {
        if (lastActiveMs <= 0L) return ""
        val diffMs = (nowMs - lastActiveMs).coerceAtLeast(0L)
        val minutes = diffMs / 60_000L
        return when {
            minutes < 1L -> "刚刚"
            minutes < 60L -> "${minutes} 分钟前"
            minutes < 24L * 60L -> "${minutes / 60L} 小时前"
            minutes < 48L * 60L -> "昨天"
            else -> "${minutes / (24L * 60L)} 天前"
        }
    }
}
