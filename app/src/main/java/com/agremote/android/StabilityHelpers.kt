package com.agremote.android

import org.mozilla.geckoview.WebRequestError
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Locale

object DownloadHelper {
    private val UNSAFE_FILENAME_CHARS = Regex("[\\\\/:*?\"<>|\\r\\n\\t]+")
    private val RFC5987_FILENAME_REGEX = Regex("(?i)filename\\*\\s*=\\s*([^;]+)")
    private val QUOTED_FILENAME_REGEX = Regex("(?i)filename\\s*=\\s*\"([^\"]+)\"")
    private val PLAIN_FILENAME_REGEX = Regex("(?i)filename\\s*=\\s*([^;\\s]+)")

    private val MIME_TO_EXT = mapOf(
        "text/plain" to "txt",
        "text/markdown" to "md",
        "text/html" to "html",
        "text/csv" to "csv",
        "application/json" to "json",
        "application/pdf" to "pdf",
        "application/zip" to "zip",
        "image/png" to "png",
        "image/jpeg" to "jpg",
        "image/webp" to "webp",
        "image/svg+xml" to "svg",
        "image/gif" to "gif"
    )

    private val EXT_TO_MIME = mapOf(
        "txt" to "text/plain",
        "log" to "text/plain",
        "md" to "text/markdown",
        "html" to "text/html",
        "htm" to "text/html",
        "csv" to "text/csv",
        "json" to "application/json",
        "pdf" to "application/pdf",
        "zip" to "application/zip",
        "png" to "image/png",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "webp" to "image/webp",
        "svg" to "image/svg+xml",
        "gif" to "image/gif"
    )

    fun extractFileName(uri: String?, contentDisposition: String?, mimeType: String?): String {
        val rawCandidate = extractFromDisposition(contentDisposition)
            ?: extractFromUri(uri)
            ?: "download"
        val sanitized = sanitizeFileName(rawCandidate)
        val cleanMime = normalizeMime(mimeType)
        if (!sanitized.contains('.')) {
            val ext = cleanMime?.let { MIME_TO_EXT[it] }
            if (!ext.isNullOrEmpty()) {
                return truncateFileName("$sanitized.$ext")
            }
        }
        return truncateFileName(sanitized)
    }

    fun resolveMimeType(contentTypeHeader: String?, fileName: String): String {
        val clean = normalizeMime(contentTypeHeader)
        if (!clean.isNullOrEmpty() && clean != "application/octet-stream") {
            return clean
        }
        val ext = fileName.substringAfterLast('.', "").lowercase(Locale.ROOT)
        if (ext.isNotEmpty()) {
            EXT_TO_MIME[ext]?.let { return it }
        }
        return clean ?: "application/octet-stream"
    }

    private fun extractFromDisposition(contentDisposition: String?): String? {
        val header = contentDisposition?.trim().orEmpty()
        if (header.isEmpty()) return null

        RFC5987_FILENAME_REGEX.find(header)?.groupValues?.getOrNull(1)?.let { extVal ->
            val trimmed = extVal.trim().trim('"', '\'')
            val encodedPart = if (trimmed.contains("''")) {
                trimmed.substringAfter("''")
            } else {
                trimmed
            }
            val decoded = runCatching {
                URLDecoder.decode(encodedPart, StandardCharsets.UTF_8.name())
            }.getOrNull()?.trim()
            if (!decoded.isNullOrEmpty()) return decoded
        }

        QUOTED_FILENAME_REGEX.find(header)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotEmpty() }?.let {
            return it
        }

        PLAIN_FILENAME_REGEX.find(header)?.groupValues?.getOrNull(1)?.trim()?.trim('"')?.takeIf { it.isNotEmpty() }?.let {
            return it
        }
        return null
    }

    private fun extractFromUri(uri: String?): String? {
        val raw = uri?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val path = runCatching { URI(raw).path }.getOrNull()
            ?: raw.substringBefore('?').substringBefore('#')
        val segment = path.substringAfterLast('/', "").trim()
        if (segment.isEmpty()) return null
        val decoded = runCatching {
            URLDecoder.decode(segment, StandardCharsets.UTF_8.name())
        }.getOrNull() ?: segment
        return decoded.trim().takeIf { it.isNotEmpty() }
    }

    private fun sanitizeFileName(rawName: String): String {
        val baseOnly = rawName.substringAfterLast('/').substringAfterLast('\\')
        val replaced = baseOnly.replace(UNSAFE_FILENAME_CHARS, "_").trim().trimStart('.')
        return if (replaced.isEmpty() || replaced == "." || replaced == "..") "download" else replaced
    }

    private fun truncateFileName(name: String): String {
        if (name.length <= 120) return name
        val dotIdx = name.lastIndexOf('.')
        if (dotIdx in 1..114) {
            val ext = name.substring(dotIdx)
            val stemMax = (120 - ext.length).coerceAtLeast(1)
            return name.substring(0, stemMax) + ext
        }
        return name.substring(0, 120)
    }

    private fun normalizeMime(rawMime: String?): String? {
        val base = rawMime?.substringBefore(';')?.trim()?.lowercase(Locale.ROOT).orEmpty()
        return base.takeIf { it.contains('/') }
    }
}

class CrashRecoveryGuard(
    private val maxCrashes: Int = 3,
    private val windowMs: Long = 30_000L
) {
    private val timestamps = ArrayDeque<Long>()

    fun recordCrashAndShouldRecover(nowMs: Long = System.currentTimeMillis()): Boolean {
        val cutoff = nowMs - windowMs
        while (timestamps.isNotEmpty() && timestamps.first() < cutoff) {
            timestamps.removeFirst()
        }
        timestamps.addLast(nowMs)
        return timestamps.size <= maxCrashes
    }

    fun reset() {
        timestamps.clear()
    }
}

data class LoadErrorCopy(
    val title: String,
    val detail: String
)

object LoadErrorFormatter {
    fun format(errorCode: Int, category: Int, host: String?): LoadErrorCopy {
        val hostLabel = host?.takeIf { it.isNotBlank() } ?: "目标服务"
        return when (errorCode) {
            WebRequestError.ERROR_OFFLINE -> LoadErrorCopy(
                title = "设备当前处于离线状态",
                detail = "未检测到可用网络连接，请开启 Wi-Fi 或移动数据后重试。"
            )
            WebRequestError.ERROR_PROXY_CONNECTION_REFUSED,
            WebRequestError.ERROR_UNKNOWN_PROXY_HOST -> LoadErrorCopy(
                title = "本地代理或 VPN 连接异常",
                detail = "无法通过代理连接到 $hostLabel，请检查手机代理或 VPN 工具是否正常运行或切换节点后重试。"
            )
            WebRequestError.ERROR_NET_TIMEOUT -> LoadErrorCopy(
                title = "连接 $hostLabel 超时",
                detail = "服务器响应时间过长。若处于移动网络或代理环境下，请确认节点连通性或电脑端 Remote Control 已开启。"
            )
            WebRequestError.ERROR_UNKNOWN_HOST -> LoadErrorCopy(
                title = "无法解析域名 $hostLabel",
                detail = "DNS 解析失败，请检查当前网络、VPN 节点是否可用，或尝试关闭/重启 VPN 后重试。"
            )
            WebRequestError.ERROR_CONNECTION_REFUSED -> LoadErrorCopy(
                title = "$hostLabel 拒绝了连接",
                detail = "目标端口暂无响应，请确认代理或本地端口状态正常。"
            )
            WebRequestError.ERROR_NET_INTERRUPT,
            WebRequestError.ERROR_NET_RESET -> LoadErrorCopy(
                title = "网络连接意外中断",
                detail = "与 $hostLabel 的连接被重置或中断，可能由网络切换或系统后台冻结引起，点击下方按钮即可重新建立连接。"
            )
            WebRequestError.ERROR_SECURITY_SSL,
            WebRequestError.ERROR_SECURITY_BAD_CERT,
            WebRequestError.ERROR_BAD_HSTS_CERT -> LoadErrorCopy(
                title = "安全证书校验未通过",
                detail = "访问 $hostLabel 时 HTTPS 证书异常，请检查系统日期时间是否正确，或确认当前网络未拦截 TLS 流量。"
            )
            else -> {
                val hint = if (category == WebRequestError.ERROR_CATEGORY_PROXY) {
                    "请检查手机代理或 VPN 设置后重试。"
                } else {
                    "请检查网络连接或 VPN 状态后重试，也可以返回设备列表重新进入。"
                }
                LoadErrorCopy(
                    title = "无法加载 $hostLabel",
                    detail = "$hint（错误码 $errorCode）"
                )
            }
        }
    }
}
