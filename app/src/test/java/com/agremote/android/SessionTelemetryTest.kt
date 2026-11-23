package com.agremote.android

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionTelemetryTest {
    @Test
    fun `parses session run status wire strings cleanly`() {
        assertEquals(SessionRunStatus.RUNNING, SessionRunStatus.fromWire("running"))
        assertEquals(SessionRunStatus.RUNNING, SessionRunStatus.fromWire(" RUNNING "))
        assertEquals(SessionRunStatus.WAITING, SessionRunStatus.fromWire("waiting"))
        assertEquals(SessionRunStatus.ERROR, SessionRunStatus.fromWire("error"))
        assertEquals(SessionRunStatus.IDLE, SessionRunStatus.fromWire("idle"))
        assertEquals(SessionRunStatus.IDLE, SessionRunStatus.fromWire(null))
        assertEquals(SessionRunStatus.IDLE, SessionRunStatus.fromWire("unknown"))
    }

    @Test
    fun `formats compact tokens and context limits consistently`() {
        assertEquals("0", SessionTelemetryParser.formatCompactTokens(0L))
        assertEquals("850", SessionTelemetryParser.formatCompactTokens(850L))
        assertEquals("3.2k", SessionTelemetryParser.formatCompactTokens(3200L))
        assertEquals("84k", SessionTelemetryParser.formatCompactTokens(84_200L))
        assertEquals("1.25M", SessionTelemetryParser.formatCompactTokens(1_250_000L))

        assertEquals("0k", SessionTelemetryParser.formatContextLimit(0L))
        assertEquals("200k", SessionTelemetryParser.formatContextLimit(200_000L))
        assertEquals("1M", SessionTelemetryParser.formatContextLimit(1_000_000L))
        assertEquals("1M", SessionTelemetryParser.formatContextLimit(1_048_576L))
        assertEquals("2M", SessionTelemetryParser.formatContextLimit(2_000_000L))
    }

    @Test
    fun `formats relative activity timestamps into simplified chinese`() {
        val now = 1_795_000_000_000L
        assertEquals("", SessionTelemetryParser.formatRelativeTime(0L, now))
        assertEquals("刚刚", SessionTelemetryParser.formatRelativeTime(now - 20_000L, now))
        assertEquals("5 分钟前", SessionTelemetryParser.formatRelativeTime(now - 5L * 60_000L, now))
        assertEquals("2 小时前", SessionTelemetryParser.formatRelativeTime(now - 2L * 3_600_000L, now))
        assertEquals("昨天", SessionTelemetryParser.formatRelativeTime(now - 30L * 3_600_000L, now))
        assertEquals("3 天前", SessionTelemetryParser.formatRelativeTime(now - 3L * 86_400_000L, now))
    }

    private fun fakeSnapshotJson(currentCid: String, hasStoreMeta: Boolean?): JSONObject {
        val metaObj = if (hasStoreMeta != null) {
            object : JSONObject() {
                override fun optBoolean(name: String?, fallback: Boolean): Boolean =
                    if (name == "hasStore") hasStoreMeta else fallback
            }
        } else {
            null
        }
        return object : JSONObject() {
            override fun optString(name: String?, fallback: String): String =
                if (name == "currentConversationId") currentCid else fallback

            override fun optJSONObject(name: String?): JSONObject? =
                if (name == "probeMeta") metaObj else null

            override fun optJSONArray(name: String?): JSONArray? = null

            override fun optLong(name: String?, fallback: Long): Long = 0L
        }
    }

    @Test
    fun `parses hasStore probe metadata flag safely`() {
        val withStore = SessionTelemetryParser.parseSnapshot(fakeSnapshotJson("c1", true))
        assertEquals("c1", withStore.currentConversationId)
        assertTrue(withStore.hasStore)

        val withoutStore = SessionTelemetryParser.parseSnapshot(fakeSnapshotJson("c1", false))
        assertFalse(withoutStore.hasStore)

        val missingMeta = SessionTelemetryParser.parseSnapshot(fakeSnapshotJson("c1", null))
        assertFalse(missingMeta.hasStore)
    }
}
