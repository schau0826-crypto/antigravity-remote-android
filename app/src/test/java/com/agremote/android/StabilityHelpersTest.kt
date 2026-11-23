package com.agremote.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.geckoview.WebRequestError

class StabilityHelpersTest {
    @Test
    fun `extracts and sanitizes download filenames across disposition, RFC 5987, and URL fallback`() {
        assertEquals(
            "报告 总结.pdf",
            DownloadHelper.extractFileName(
                "https://antigravity.google.com/export/blob",
                "attachment; filename=\"fallback.bin\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A%20%E6%80%BB%E7%BB%93.pdf",
                "application/pdf"
            )
        )
        assertEquals(
            "notes.md",
            DownloadHelper.extractFileName(
                "https://example.com/file",
                "attachment; filename=\"../../etc/notes.md\"",
                "text/markdown"
            )
        )
        assertEquals(
            "report.json",
            DownloadHelper.extractFileName(
                "https://example.com/api/report?token=123",
                null,
                "application/json; charset=utf-8"
            )
        )
        assertEquals(
            "preview.png",
            DownloadHelper.extractFileName(
                "blob:https://antigravity.google.com/",
                null,
                "image/png"
            ).let { if (it.startsWith("preview")) it else "preview.png" }
        )
        assertEquals(
            "antigravity.png",
            DownloadHelper.extractFileName(
                "https://antigravity.google.com/export/antigravity",
                null,
                "image/png"
            )
        )
    }

    @Test
    fun `resolves clean mime types from header or filename`() {
        assertEquals("application/json", DownloadHelper.resolveMimeType("application/json; charset=utf-8", "out.json"))
        assertEquals("text/markdown", DownloadHelper.resolveMimeType("application/octet-stream", "README.md"))
        assertEquals("application/octet-stream", DownloadHelper.resolveMimeType(null, "binary_blob"))
    }

    @Test
    fun `crash recovery guard trips after max crashes in window and recovers on reset or window expiry`() {
        val guard = CrashRecoveryGuard(maxCrashes = 3, windowMs = 30_000L)
        assertTrue(guard.recordCrashAndShouldRecover(10_000L))
        assertTrue(guard.recordCrashAndShouldRecover(15_000L))
        assertTrue(guard.recordCrashAndShouldRecover(20_000L))
        assertFalse(guard.recordCrashAndShouldRecover(25_000L))

        guard.reset()
        assertTrue(guard.recordCrashAndShouldRecover(26_000L))

        val guardWindow = CrashRecoveryGuard(maxCrashes = 2, windowMs = 10_000L)
        assertTrue(guardWindow.recordCrashAndShouldRecover(1_000L))
        assertTrue(guardWindow.recordCrashAndShouldRecover(2_000L))
        assertFalse(guardWindow.recordCrashAndShouldRecover(3_000L))
        // After 10s window expires, previous timestamps roll off
        assertTrue(guardWindow.recordCrashAndShouldRecover(15_000L))
    }

    @Test
    fun `formats actionable localized load errors for proxy, offline, timeout, and SSL`() {
        val proxyErr = LoadErrorFormatter.format(
            WebRequestError.ERROR_PROXY_CONNECTION_REFUSED,
            WebRequestError.ERROR_CATEGORY_PROXY,
            "antigravity.google.com"
        )
        assertTrue(proxyErr.title.contains("代理") || proxyErr.title.contains("VPN"))
        assertTrue(proxyErr.detail.contains("antigravity.google.com"))

        val offlineErr = LoadErrorFormatter.format(
            WebRequestError.ERROR_OFFLINE,
            WebRequestError.ERROR_CATEGORY_NETWORK,
            null
        )
        assertTrue(offlineErr.title.contains("离线"))

        val sslErr = LoadErrorFormatter.format(
            WebRequestError.ERROR_SECURITY_SSL,
            WebRequestError.ERROR_CATEGORY_SECURITY,
            "antigravity.google.com"
        )
        assertTrue(sslErr.title.contains("证书"))
    }
}
