package com.agremote.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsStoreTest {
    @Test
    fun `parses valid custom dictionary json objects`() {
        val empty = SettingsStore.parseCustomDictJson("")
        assertTrue(empty.isValid)
        assertTrue(empty.entries.isEmpty())
        assertEquals("{}", empty.normalizedJson)

        val valid = SettingsStore.parseCustomDictJson(
            """
            {
              "Remote Control": "远程控制",
              "New \"Task\"\nLine": "新建任务\\分支"
            }
            """.trimIndent()
        )
        assertTrue(valid.isValid)
        assertEquals(2, valid.entries.size)
        assertEquals("远程控制", valid.entries["Remote Control"])
        assertEquals("新建任务\\分支", valid.entries["New \"Task\"\nLine"])
    }

    @Test
    fun `rejects non-object json, non-string values, empty keys, and malformed syntax`() {
        val cases = listOf(
            "[\"Remote Control\"]",
            "\"hello\"",
            "{\"Remote Control\": 123}",
            "{\"Remote Control\": true}",
            "{\"Remote Control\": {\"nested\": \"x\"}}",
            "{\"   \": \"空键\"}",
            "{\"Remote Control\": \"远程控制\",}",
            "{\"Remote Control\": \"远程控制\" extra}",
            "{unquoted: \"val\"}"
        )

        for (raw in cases) {
            val result = SettingsStore.parseCustomDictJson(raw)
            assertFalse("Expected invalid result for: $raw", result.isValid)
            assertNotNull("Expected errorMessage for: $raw", result.errorMessage)
        }
    }

    @Test
    fun `round trips unicode escapes and special characters`() {
        val original = mapOf(
            "Unicode \\u4e2d" to "中文测试",
            "Quote \"A\"" to "引号 \"A\""
        )
        val json = CustomDictJsonParser.serialize(original, pretty = true)
        val reparsed = SettingsStore.parseCustomDictJson(json)
        assertTrue(reparsed.isValid)
        assertEquals(original, reparsed.entries)

        val escaped = SettingsStore.parseCustomDictJson("""{"Key": "\u4e2d\u6587"}""")
        assertTrue(escaped.isValid)
        assertEquals("中文", escaped.entries["Key"])
    }

    @Test
    fun `resolves startup url based on rememberLastRemote flag`() {
        val remoteUrl = "https://antigravity.google.com/r/example-machine-v2"
        val withRemember = AppSettings(
            homeUrl = "https://antigravity.google.com/",
            rememberLastRemote = true,
            lastRemoteUrl = remoteUrl
        )
        assertEquals(remoteUrl, SettingsStore.resolveStartupUrl(withRemember))

        val withoutRemember = withRemember.copy(rememberLastRemote = false)
        assertEquals("https://antigravity.google.com/", SettingsStore.resolveStartupUrl(withoutRemember))

        val withInvalidLast = withRemember.copy(lastRemoteUrl = "https://accounts.google.com/ServiceLogin")
        assertEquals("https://antigravity.google.com/", SettingsStore.resolveStartupUrl(withInvalidLast))
    }
}
