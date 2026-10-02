// JobDesk.app, DMG edition: a Mac app with its own window.
//
// tools/build-dmg.sh compiles this (universal: arm64 + x86_64) and puts the
// launcher (macos/dmg/launch) and the payload in Contents/Resources. The first
// time it opens (and after a newer DMG) it sets JobDesk up from that payload
// with a progress window; then it starts JobDesk's local server and shows the
// web app in its own window (WebKit, like Safari). While the app is open the
// server runs; quitting stops it.
//
// What a browser would do for free, done here: résumé uploads (file picker),
// PDFs (saved to Downloads and opened in Preview), job postings and other
// sites (the default browser), mailto: (the mail app), JavaScript dialogs,
// copy/paste/undo, back/forward, reload, zoom. The app's name in every window
// and dialog comes from Info.plist (a branded build renames it).

import Cocoa
import WebKit

let appName = (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ?? "JobDesk"
let launcher = Bundle.main.resourceURL!.appendingPathComponent("launch").path

/// Runs the launcher with arguments; returns its exit code and output.
@discardableResult
func launch(_ args: [String]) -> (code: Int32, out: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/bash")
    p.arguments = [launcher] + args
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = pipe
    do { try p.run() } catch { return (127, error.localizedDescription) }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    return (p.terminationStatus, String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
}

func isLocal(_ url: URL?) -> Bool {
    guard let host = url?.host?.lowercased() else { return url?.scheme == "about" || url?.scheme == "blob" || url?.scheme == "data" }
    return host == "127.0.0.1" || host == "localhost" || host == "::1"
}

/// The web view: a click on a window that isn't in front still counts (a
/// link or button works on the first click, as in a browser).
final class AppWebView: WKWebView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow?
    var webView: WKWebView?
    var setupWindow: NSWindow?
    var setupBar: NSProgressIndicator?
    var setupLabel: NSTextField?
    var aliveTimer: Timer?
    var downloads: [ObjectIdentifier: URL] = [:]
    var quitting = false

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        NSApp.activate(ignoringOtherApps: true)
        if launch(["where"]).out != "ok" {
            alert("Please move \(appName) into your Applications folder first.",
                  "In the window that came with it, drag its icon onto the Applications folder. Then open it from your Applications folder (or Launchpad).")
            NSApp.terminate(nil)
            return
        }
        start()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Clicking the Dock icon brings the window back.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if let w = window { w.makeKeyAndOrderFront(nil) } else { start() }
        return true
    }

    func applicationWillTerminate(_ note: Notification) {
        quitting = true
        aliveTimer?.invalidate()
        launch(["stop", "--quiet"])
    }

    // MARK: Setting up and starting

    func start() {
        DispatchQueue.global(qos: .userInitiated).async {
            if self.launch1(["needs-setup"]) == "yes" {
                DispatchQueue.main.sync { self.showSetup() }
                if let failure = self.runSetup() {
                    DispatchQueue.main.async { self.fail("\(appName)'s setup didn't finish.", failure) }
                    return
                }
            }
            DispatchQueue.main.async { self.setupLabel?.stringValue = "Opening \(appName)…" }
            let r = launch(["serve-url"])
            DispatchQueue.main.async {
                self.hideSetup()
                // 3: `jobdesk stop` ran while it was starting. Not a failure.
                if r.code == 3 { NSApp.terminate(nil); return }
                let url = r.out.split(separator: "\n").last.map(String.init) ?? ""
                guard r.code == 0, let u = URL(string: url), u.scheme?.hasPrefix("http") == true else {
                    self.fail("\(appName) couldn't start.", r.out)
                    return
                }
                self.showMain(u)
            }
        }
    }

    func launch1(_ args: [String]) -> String { launch(args).out }

    /// Runs first-run setup, updating the progress window; nil when it worked.
    func runSetup() -> String? {
        launch(["setup-start"])
        while true {
            Thread.sleep(forTimeInterval: 0.5)
            let s = launch1(["setup-status"])
            if s.hasPrefix("done|") { return nil }
            if s.hasPrefix("failed|") {
                let msg = String(s.dropFirst(7))
                return msg.isEmpty ? "Setup stopped unexpectedly." : msg
            }
            let parts = s.split(separator: "|", maxSplits: 1).map(String.init)
            DispatchQueue.main.async {
                if let pct = Double(parts.first ?? "") { self.setupBar?.doubleValue = pct }
                if parts.count > 1 { self.setupLabel?.stringValue = parts[1] }
            }
        }
    }

    func showSetup() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 150), styleMask: [.titled], backing: .buffered, defer: false)
        w.title = appName
        let title = NSTextField(labelWithString: "Setting up \(appName)…")
        title.font = .boldSystemFont(ofSize: 14)
        let note = NSTextField(labelWithString: "This only happens the first time. It takes about a minute.")
        note.textColor = .secondaryLabelColor
        let bar = NSProgressIndicator()
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 100
        let label = NSTextField(labelWithString: "Starting")
        label.textColor = .secondaryLabelColor
        let stack = NSStackView(views: [title, note, bar, label])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 20, left: 20, bottom: 20, right: 20)
        bar.widthAnchor.constraint(equalToConstant: 380).isActive = true
        w.contentView = stack
        w.center()
        w.makeKeyAndOrderFront(nil)
        setupWindow = w
        setupBar = bar
        setupLabel = label
    }

    func hideSetup() {
        setupWindow?.orderOut(nil)
        setupWindow = nil
    }

    func fail(_ title: String, _ detail: String) {
        hideSetup()
        let a = NSAlert()
        a.alertStyle = .warning
        a.messageText = title
        a.informativeText = detail
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Show Log")
        if a.runModal() == .alertSecondButtonReturn { launch(["logs", "--reveal"]) }
        NSApp.terminate(nil)
    }

    func alert(_ title: String, _ detail: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = detail
        a.runModal()
    }

    // MARK: The window

    func showMain(_ url: URL) {
        if let w = window, let wv = webView {
            wv.load(URLRequest(url: url))
            w.makeKeyAndOrderFront(nil)
            return
        }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        // The brand song starts when a resume is read, a moment after the click.
        config.mediaTypesRequiringUserActionForPlayback = []
        let wv = AppWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.allowsMagnification = true
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: min(1320, screen.width * 0.9), height: min(900, screen.height * 0.9))
        let w = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                         backing: .buffered, defer: false)
        w.title = appName
        w.minSize = NSSize(width: 760, height: 520)
        w.contentView = wv
        w.center()
        w.setFrameAutosaveName("main")
        w.makeKeyAndOrderFront(nil)
        window = w
        webView = wv
        wv.load(URLRequest(url: url))
        // If the server stops some other way, quit too (an in-app update keeps
        // `alive` true while it installs, so that never counts).
        aliveTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { _ in
            DispatchQueue.global().async {
                if launch(["alive"]).code != 0 {
                    DispatchQueue.main.async { if !self.quitting { NSApp.terminate(nil) } }
                }
            }
        }
    }

    // MARK: Links, PDFs and downloads

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if action.shouldPerformDownload { return decisionHandler(.download) }
        if ["mailto", "tel", "sms"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        // Job postings and every other site: the default browser.
        if !isLocal(url) {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let r = response.response as? HTTPURLResponse
        let disposition = (r?.value(forHTTPHeaderField: "Content-Disposition") ?? "").lowercased()
        let pdf = response.response.mimeType == "application/pdf"
        // A PDF or an attachment: save it rather than leave the app's page.
        if pdf || disposition.hasPrefix("attachment") || !response.canShowMIMEType {
            return decisionHandler(.download)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first!
        let name = suggestedFilename.isEmpty ? "download" : suggestedFilename
        var dest = dir.appendingPathComponent(name)
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        var n = 2
        while FileManager.default.fileExists(atPath: dest.path) {
            dest = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
            n += 1
        }
        downloads[ObjectIdentifier(download)] = dest
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) { NSWorkspace.shared.open(url) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        alert("The download didn't finish.", error.localizedDescription)
    }

    // The server isn't answering (it's restarting): try again shortly.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && e.code == 102 { return } // became a download
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak webView] in webView?.reload() }
    }

    // Links that open a new window (target=_blank, window.open).
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if !isLocal(url) {
            NSWorkspace.shared.open(url)
        } else if url.path.lowercased().contains("pdf") {
            webView.startDownload(using: action.request) { $0.delegate = self }
        } else {
            webView.load(action.request)
        }
        return nil
    }

    // MARK: Files and dialogs

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.beginSheetModal(for: webView.window ?? NSApp.keyWindow ?? NSWindow()) { r in
            completionHandler(r == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert()
        a.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        a.accessoryView = field
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }

    // MARK: Menus

    @objc func reload(_ sender: Any?) { webView?.reload() }
    @objc func goBack(_ sender: Any?) { webView?.goBack() }
    @objc func goForward(_ sender: Any?) { webView?.goForward() }
    @objc func zoomIn(_ sender: Any?) { webView.map { $0.pageZoom = min(2.0, $0.pageZoom + 0.1) } }
    @objc func zoomOut(_ sender: Any?) { webView.map { $0.pageZoom = max(0.5, $0.pageZoom - 0.1) } }
    @objc func actualSize(_ sender: Any?) { webView?.pageZoom = 1.0 }

    func buildMenu() {
        let main = NSMenu()
        func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            return i
        }
        func submenu(_ title: String, _ items: [NSMenuItem]) {
            let top = NSMenuItem()
            let m = NSMenu(title: title)
            items.forEach { m.addItem($0) }
            top.submenu = m
            main.addItem(top)
        }
        submenu(appName, [
            item("About \(appName)", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""),
            .separator(),
            item("Hide \(appName)", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            item("Show All", #selector(NSApplication.unhideAllApplications(_:)), ""),
            .separator(),
            item("Quit \(appName)", #selector(NSApplication.terminate(_:)), "q"),
        ])
        submenu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
        ])
        submenu("View", [
            item("Reload", #selector(reload(_:)), "r"),
            item("Back", #selector(goBack(_:)), "["),
            item("Forward", #selector(goForward(_:)), "]"),
            .separator(),
            item("Actual Size", #selector(actualSize(_:)), "0"),
            item("Zoom In", #selector(zoomIn(_:)), "+"),
            item("Zoom Out", #selector(zoomOut(_:)), "-"),
        ])
        submenu("Window", [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Zoom", #selector(NSWindow.performZoom(_:)), ""),
            item("Close", #selector(NSWindow.performClose(_:)), "w"),
        ])
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
