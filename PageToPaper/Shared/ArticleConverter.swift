import Foundation

enum EpubLimits {
    /// Output cap for the stored ZIP. The draft HTML cap is smaller; this stops a blown-up document.
    static let maxBytes = 2_000_000
}

enum EpubFailure: Error, Equatable {
    case tooLarge
    case unrepresentable
}

enum EpubBuild: Equatable {
    case epub(Data)
    case failure(EpubFailure)
}

struct ArticleConverter {
    /// Builds an EPUB 3 package. A failure says why instead of returning nil.
    func makeEpub(from draft: ArticleDraft) -> EpubBuild {
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = draft.url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, !url.isEmpty else {
            return .failure(.unrepresentable)
        }
        let byline = draft.byline?.trimmingCharacters(in: .whitespacesAndNewlines)
        let html = draft.html?.trimmingCharacters(in: .whitespacesAndNewlines)
        let identifier = "urn:uuid:\(UUID().uuidString.lowercased())"
        let modified = Self.modifiedTimestamp()
        let escapedTitle = XMLText.escape(title)
        let files = [
            StoredZip.Entry(name: "mimetype", data: Data("application/epub+zip".utf8)),
            StoredZip.Entry(name: "META-INF/container.xml", data: Data(Self.containerXML.utf8)),
            StoredZip.Entry(name: "OEBPS/content.opf", data: Data(Self.packageXML(title: escapedTitle, identifier: XMLText.escape(identifier), modified: modified).utf8)),
            StoredZip.Entry(name: "OEBPS/nav.xhtml", data: Data(Self.navigationXML(title: escapedTitle).utf8)),
            StoredZip.Entry(
                name: "OEBPS/chapter.xhtml",
                data: Data(Self.chapterXML(title: escapedTitle, url: XMLText.escape(url), byline: byline.map(XMLText.escape), html: html).utf8)
            ),
        ]
        guard let archive = StoredZip.archive(files) else {
            return .failure(.unrepresentable)
        }
        if archive.count > EpubLimits.maxBytes {
            return .failure(.tooLarge)
        }
        return .epub(archive)
    }

    private static func modifiedTimestamp() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"
        return formatter.string(from: Date())
    }

    private static let containerXML = """
    <?xml version="1.0" encoding="UTF-8"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>
    """

    private static func packageXML(title: String, identifier: String, modified: String) -> String {
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:identifier id="pub-id">\(identifier)</dc:identifier>
            <dc:title>\(title)</dc:title>
            <dc:language>en</dc:language>
            <meta property="dcterms:modified">\(modified)</meta>
          </metadata>
          <manifest>
            <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
            <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine>
            <itemref idref="chapter"/>
          </spine>
        </package>
        """
    }

    private static func navigationXML(title: String) -> String {
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
          <head><title>\(title)</title></head>
          <body>
            <nav epub:type="toc">
              <ol><li><a href="chapter.xhtml">\(title)</a></li></ol>
            </nav>
          </body>
        </html>
        """
    }

    private static func chapterXML(title: String, url: String, byline: String?, html: String?) -> String {
        var body = "<h1>\(title)</h1>"
        if let byline, !byline.isEmpty {
            body += "<p>\(byline)</p>"
        }
        body += "<p><a href=\"\(url)\">\(url)</a></p>"
        if let html, !html.isEmpty {
            body += XHTMLFragment.render(html)
        }
        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
          <head><title>\(title)</title></head>
          <body>
            \(body)
          </body>
        </html>
        """
    }
}

/// 2020-01-01 in the DOS date field. The EPUB `modified` metadata carries the real time.
private enum ZipTime {
    static let date = UInt16((2020 - 1980) << 9 | 1 << 5 | 1)
}

/// Stored (uncompressed) ZIP. EPUB requires `mimetype` first and uncompressed; every entry here is stored.
private enum StoredZip {
    struct Entry {
        var name: String
        var data: Data
    }

    static func archive(_ entries: [Entry]) -> Data? {
        guard !entries.isEmpty, entries.count <= Int(UInt16.max) else { return nil }
        var locals = Data()
        var central = Data()
        for entry in entries {
            guard let name = entry.name.data(using: .utf8),
                  isSafeName(entry.name),
                  name.count <= Int(UInt16.max),
                  entry.data.count <= Int(UInt32.max),
                  locals.count <= Int(UInt32.max)
            else {
                return nil
            }
            let crc = CRC32.checksum(entry.data)
            let offset = UInt32(locals.count)
            let size = UInt32(entry.data.count)
            appendLocalHeader(to: &locals, name: name, crc: crc, size: size)
            locals.append(entry.data)
            appendCentralHeader(to: &central, name: name, crc: crc, size: size, offset: offset)
        }
        guard central.count <= Int(UInt32.max), locals.count <= Int(UInt32.max) else { return nil }
        var trailer = Data()
        trailer.appendLE(UInt32(0x06054B50))
        trailer.appendLE(UInt16(0))
        trailer.appendLE(UInt16(0))
        trailer.appendLE(UInt16(entries.count))
        trailer.appendLE(UInt16(entries.count))
        trailer.appendLE(UInt32(central.count))
        trailer.appendLE(UInt32(locals.count))
        trailer.appendLE(UInt16(0))
        var archive = Data()
        archive.reserveCapacity(locals.count + central.count + trailer.count)
        archive.append(locals)
        archive.append(central)
        archive.append(trailer)
        return archive
    }

    private static func isSafeName(_ name: String) -> Bool {
        !name.isEmpty && !name.hasPrefix("/") && !name.contains("\\") && !name.contains("..")
    }

    private static func appendLocalHeader(to data: inout Data, name: Data, crc: UInt32, size: UInt32) {
        data.appendLE(UInt32(0x04034B50))
        data.appendLE(UInt16(20))
        data.appendLE(UInt16(0))
        data.appendLE(UInt16(0))
        data.appendLE(UInt16(0))
        data.appendLE(ZipTime.date)
        data.appendLE(crc)
        data.appendLE(size)
        data.appendLE(size)
        data.appendLE(UInt16(name.count))
        data.appendLE(UInt16(0))
        data.append(name)
    }

    private static func appendCentralHeader(to data: inout Data, name: Data, crc: UInt32, size: UInt32, offset: UInt32) {
        data.appendLE(UInt32(0x02014B50))
        data.appendLE(UInt16(20))
        data.appendLE(UInt16(20))
        data.appendLE(UInt16(0))
        data.appendLE(UInt16(0))
        data.appendLE(UInt16(0))
        data.appendLE(ZipTime.date)
        data.appendLE(crc)
        data.appendLE(size)
        data.appendLE(size)
        data.appendLE(UInt16(name.count))
        data.appendLE(UInt16(0))
        data.appendLE(UInt16(0))
        data.appendLE(UInt16(0))
        data.appendLE(UInt16(0))
        data.appendLE(UInt32(0))
        data.appendLE(offset)
        data.append(name)
    }
}

private enum CRC32 {
    private static let table: [UInt32] = (0..<256).map { index in
        var crc = UInt32(index)
        for _ in 0..<8 {
            crc = (crc & 1) == 1 ? (0xEDB88320 ^ (crc >> 1)) : (crc >> 1)
        }
        return crc
    }

    static func checksum(_ data: Data) -> UInt32 {
        var crc = UInt32(0xFFFF_FFFF)
        for byte in data {
            crc = table[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8)
        }
        return crc ^ 0xFFFF_FFFF
    }
}

private extension Data {
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
        var little = value.littleEndian
        Swift.withUnsafeBytes(of: &little) { buffer in
            append(contentsOf: buffer)
        }
    }
}

private enum XMLText {
    static func escape(_ raw: String) -> String {
        var result = ""
        result.reserveCapacity(raw.count)
        var index = raw.startIndex
        while index < raw.endIndex {
            let character = raw[index]
            if character == "&", let decoded = decodeEntity(raw, from: raw.index(after: index)) {
                appendEscaped(decoded.scalar, to: &result)
                index = decoded.next
                continue
            }
            for scalar in character.unicodeScalars {
                appendEscaped(scalar, to: &result)
            }
            index = raw.index(after: index)
        }
        return result
    }

    private static func appendEscaped(_ scalar: Unicode.Scalar, to result: inout String) {
        switch scalar {
        case "&": result += "&amp;"
        case "<": result += "&lt;"
        case ">": result += "&gt;"
        case "\"": result += "&quot;"
        case "'": result += "&apos;"
        default:
            if isXMLChar(scalar) {
                result.unicodeScalars.append(scalar)
            }
        }
    }

    private static func isXMLChar(_ scalar: Unicode.Scalar) -> Bool {
        let value = scalar.value
        return value == 0x9 || value == 0xA || value == 0xD
            || (value >= 0x20 && value <= 0xD7FF)
            || (value >= 0xE000 && value <= 0xFFFD)
            || (value >= 0x10000 && value <= 0x10FFFF)
    }

    /// Decodes the named entities listed below, plus numeric forms. Any other name is left as literal text
    /// (`&eacute;` becomes the characters `&eacute;`). That is acceptable only while the reader sends
    /// DOM-serialized HTML, where those characters are already decoded. Revisit this if raw source HTML is captured.
    private static func decodeEntity(_ raw: String, from start: String.Index) -> (scalar: Unicode.Scalar, next: String.Index)? {
        guard start < raw.endIndex else { return nil }
        if raw[start] == "#" {
            return decodeNumeric(raw, from: raw.index(after: start))
        }
        let names: [String: Unicode.Scalar] = [
            "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'",
            "nbsp": "\u{00A0}", "copy": "\u{00A9}", "reg": "\u{00AE}",
            "laquo": "\u{00AB}", "raquo": "\u{00BB}", "middot": "\u{00B7}",
            "lsquo": "\u{2018}", "rsquo": "\u{2019}", "ldquo": "\u{201C}", "rdquo": "\u{201D}",
            "ndash": "\u{2013}", "mdash": "\u{2014}", "bull": "\u{2022}", "hellip": "\u{2026}",
            "trade": "\u{2122}",
        ]
        var index = start
        var name = ""
        while index < raw.endIndex, raw[index].isLetter, name.count < 8 {
            name.append(raw[index])
            index = raw.index(after: index)
        }
        guard index < raw.endIndex, raw[index] == ";", let scalar = names[name] else { return nil }
        return (scalar, raw.index(after: index))
    }

    private static func decodeNumeric(_ raw: String, from start: String.Index) -> (scalar: Unicode.Scalar, next: String.Index)? {
        var index = start
        var hex = false
        if index < raw.endIndex, raw[index] == "x" || raw[index] == "X" {
            hex = true
            index = raw.index(after: index)
        }
        var value: UInt32 = 0
        var digits = 0
        while index < raw.endIndex, digits < 6 {
            let character = raw[index]
            let digit: UInt32?
            if hex, let number = character.hexDigitValue {
                digit = UInt32(number)
            } else if !hex, let number = character.wholeNumberValue, number < 10 {
                digit = UInt32(number)
            } else {
                digit = nil
            }
            guard let digit else { break }
            value = hex ? (value << 4) + digit : (value * 10) + digit
            digits += 1
            index = raw.index(after: index)
        }
        guard digits > 0, index < raw.endIndex, raw[index] == ";",
              let scalar = Unicode.Scalar(value), isXMLChar(scalar)
        else {
            return nil
        }
        return (scalar, raw.index(after: index))
    }
}

/// Turns article HTML into a fragment that can sit inside XHTML. Unreadable markup becomes escaped text.
private enum XHTMLFragment {
    static func render(_ html: String) -> String {
        var sanitizer = Sanitizer(html)
        if let safe = sanitizer.parse() {
            return safe
        }
        return "<p>\(XMLText.escape(html))</p>"
    }
}

private struct Sanitizer {
    private let text: String
    private var index: String.Index
    private var output = ""
    private var stack: [String] = []

    init(_ text: String) {
        self.text = text
        self.index = text.startIndex
    }

    private static let allowed: Set<String> = [
        "p", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li", "blockquote", "pre", "code", "em", "strong", "b", "i",
        "a", "section", "article", "header", "footer", "figure", "figcaption",
        "sup", "sub", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
        "dl", "dt", "dd", "q", "cite", "small", "br", "hr",
    ]
    private static let voids: Set<String> = ["br", "hr"]
    private static let dropWithContent: Set<String> = [
        "script", "style", "iframe", "object", "svg", "math", "noscript",
        "template", "head", "canvas", "video", "audio", "textarea", "select",
        "applet", "frameset", "noframes", "noembed", "title",
    ]

    mutating func parse() -> String? {
        while index < text.endIndex {
            if text[index] == "<" {
                guard consumeTag() else { return nil }
            } else {
                consumeText()
            }
        }
        while let open = stack.popLast() {
            output += "</\(open)>"
        }
        return output
    }

    private mutating func consumeText() {
        let start = index
        while index < text.endIndex, text[index] != "<" {
            index = text.index(after: index)
        }
        output += XMLText.escape(String(text[start..<index]))
    }

    private mutating func consumeTag() -> Bool {
        let tagStart = index
        guard consumeTagBody() else {
            // The construct never closed, so the rest of the input belongs to it.
            // Keep markup already written and escape only this tail.
            output += XMLText.escape(String(text[tagStart...]))
            index = text.endIndex
            return true
        }
        return true
    }

    private mutating func consumeTagBody() -> Bool {
        if text[index...].hasPrefix("<!--") {
            guard let end = text[index...].range(of: "-->") else { return false }
            index = end.upperBound
            return true
        }
        if text[index...].hasPrefix("<![CDATA[") {
            return consumeCDATA()
        }
        if text[index...].hasPrefix("<![") {
            guard let end = text[index...].firstIndex(of: ">") else { return false }
            index = text.index(after: end)
            return true
        }
        if text[index...].hasPrefix("<?") || text[index...].hasPrefix("<!") {
            guard let end = text[index...].firstIndex(of: ">") else { return false }
            index = text.index(after: end)
            return true
        }
        guard let tag = readTag() else { return false }
        let name = tag.name.lowercased()
        if tag.closing {
            close(name)
            return true
        }
        if Self.dropWithContent.contains(name) {
            if !tag.selfClosing {
                skipUntilClose(name)
            }
            return true
        }
        if name == "img" {
            if let alt = tag.attributes["alt"], !alt.isEmpty {
                output += XMLText.escape(alt)
            }
            return true
        }
        guard Self.allowed.contains(name) else { return true }
        if Self.voids.contains(name) {
            output += "<\(name) />"
            return true
        }
        // HTML ignores a trailing slash on a non-void element, so `<p/>` stays open.
        output += "<\(name)\(anchorAttribute(name, tag.attributes))>"
        stack.append(name)
        return true
    }

    private func anchorAttribute(_ name: String, _ attributes: [String: String]) -> String {
        guard name == "a", let href = safeHref(attributes["href"]) else { return "" }
        return " href=\"\(XMLText.escape(href))\""
    }

    private func safeHref(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.count <= 2_000 else { return nil }
        if value.unicodeScalars.contains(where: { $0.value <= 32 || $0.value == 127 || $0 == "\\" || $0 == "<" || $0 == ">" || $0 == "\"" || $0 == "'" }) {
            return nil
        }
        let lower = value.lowercased()
        if lower.hasPrefix("https://") || lower.hasPrefix("http://") || value.hasPrefix("#") {
            return value
        }
        return nil
    }

    private mutating func close(_ name: String) {
        guard let at = stack.lastIndex(of: name) else { return }
        while stack.count > at {
            output += "</\(stack.removeLast())>"
        }
    }

    private mutating func skipUntilClose(_ name: String) {
        while index < text.endIndex {
            guard let found = text[index...].range(of: "</") else {
                index = text.endIndex
                return
            }
            index = found.upperBound
            let nameStart = index
            while index < text.endIndex, isNameChar(text[index]) {
                index = text.index(after: index)
            }
            let foundName = text[nameStart..<index].lowercased()
            while index < text.endIndex, text[index].isWhitespace {
                index = text.index(after: index)
            }
            if foundName == name, index < text.endIndex, text[index] == ">" {
                index = text.index(after: index)
                return
            }
        }
    }

    private struct Tag {
        var name: String
        var attributes: [String: String]
        var closing: Bool
        var selfClosing: Bool
    }

    private mutating func readTag() -> Tag? {
        let start = index
        index = text.index(after: index)
        var closing = false
        if index < text.endIndex, text[index] == "/" {
            closing = true
            index = text.index(after: index)
        }
        skipWhitespace()
        let nameStart = index
        if index < text.endIndex, isNameStart(text[index]) {
            index = text.index(after: index)
            while index < text.endIndex, isNameChar(text[index]) {
                index = text.index(after: index)
            }
        }
        let name = String(text[nameStart..<index])
        if name.isEmpty {
            output += "&lt;"
            index = text.index(after: start)
            return Tag(name: "", attributes: [:], closing: false, selfClosing: false)
        }
        var attributes: [String: String] = [:]
        var selfClosing = false
        while index < text.endIndex {
            skipWhitespace()
            if index < text.endIndex, text[index] == "/" {
                selfClosing = true
                index = text.index(after: index)
                skipWhitespace()
            }
            guard index < text.endIndex else { return nil }
            if text[index] == ">" {
                index = text.index(after: index)
                return Tag(name: name, attributes: attributes, closing: closing, selfClosing: selfClosing)
            }
            guard consumeAttribute(into: &attributes) else { return nil }
        }
        return nil
    }

    /// False only when the attribute is unterminated. A name this parser cannot read is dropped.
    private mutating func consumeAttribute(into attributes: inout [String: String]) -> Bool {
        guard index < text.endIndex else { return false }
        if !isNameStart(text[index]) {
            return skipOddAttribute()
        }
        let nameStart = index
        index = text.index(after: index)
        while index < text.endIndex, isAttributeChar(text[index]) {
            index = text.index(after: index)
        }
        let name = text[nameStart..<index].lowercased()
        guard !name.isEmpty else { return skipOddAttribute() }
        skipWhitespace()
        guard index < text.endIndex else { return false }
        if text[index] != "=" {
            attributes[name] = ""
            return true
        }
        index = text.index(after: index)
        guard let value = readAttributeValue() else { return false }
        attributes[name] = value
        return true
    }

    /// Drops `_ngcontent`, `@click`, `:class`, and similar. A missing closing quote still fails the parse.
    private mutating func skipOddAttribute() -> Bool {
        while index < text.endIndex {
            let character = text[index]
            if character == "=" || character.isWhitespace || character == "/" || character == ">" {
                break
            }
            index = text.index(after: index)
        }
        guard index < text.endIndex else { return false }
        if text[index] != "=" {
            return true
        }
        index = text.index(after: index)
        return readAttributeValue() != nil
    }

    private mutating func readAttributeValue() -> String? {
        skipWhitespace()
        guard index < text.endIndex else { return nil }
        let quote = text[index]
        if quote == "\"" || quote == "'" {
            index = text.index(after: index)
            let valueStart = index
            while index < text.endIndex, text[index] != quote {
                index = text.index(after: index)
            }
            guard index < text.endIndex else { return nil }
            let value = String(text[valueStart..<index])
            index = text.index(after: index)
            return value
        }
        let valueStart = index
        while index < text.endIndex, !text[index].isWhitespace, text[index] != ">" {
            index = text.index(after: index)
        }
        return String(text[valueStart..<index])
    }

    private mutating func consumeCDATA() -> Bool {
        let marker = "<![CDATA["
        guard text[index...].hasPrefix(marker) else { return false }
        index = text.index(index, offsetBy: marker.count)
        guard let end = text[index...].range(of: "]]>") else { return false }
        output += XMLText.escape(String(text[index..<end.lowerBound]))
        index = end.upperBound
        return true
    }

    private mutating func skipWhitespace() {
        while index < text.endIndex, text[index].isWhitespace {
            index = text.index(after: index)
        }
    }

    private func isNameStart(_ character: Character) -> Bool {
        character.isASCII && character.isLetter
    }

    private func isNameChar(_ character: Character) -> Bool {
        character.isASCII && (character.isLetter || character.isNumber || character == "-")
    }

    private func isAttributeChar(_ character: Character) -> Bool {
        isNameChar(character) || character == "-" || character == ":" || character == "_"
    }
}
