import AppKit
import WebKit

// The desktop client shares the deployed application and its server-side access
// controls. It exposes no native scripting bridge to web content.
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let origin = "https://bloch.space"
    let externalHosts: Set<String> = ["bloch-graphus.xyz", "blochl1.com", "blochinc.xyz", "aml-blochinc.pages.dev", "github.com", "blockstream.info", "mempool.space", "ethereum.org"]

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 940), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Bloch Space"
        window.minSize = NSSize(width: 760, height: 560)
        window.contentView = web
        window.setFrameAutosaveName("BlochSpaceWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        buildMenu()
        load("/app/?network=bloch&view=overview")
        NSApp.activate(ignoringOtherApps: true)
    }

    func load(_ path: String) { web.load(URLRequest(url: URL(string: origin + path)!)) }
    @objc func home() { load("/app/") }
    @objc func reload() { if web.url?.isFileURL == true { home() } else { web.reload() } }
    @objc func back() { if web.canGoBack { web.goBack() } }
    @objc func forward() { if web.canGoForward { web.goForward() } }
    @objc func account() { load("/account/") }
    @objc func graphLab() { load("/graph/") }
    @objc func network(_ item: NSMenuItem) { load(item.representedObject as? String ?? "/app/") }
    @objc func openBrowser() { let url = web.url; if let url, url.scheme == "https", url.host == "bloch.space" { NSWorkspace.shared.open(url) } }
    @objc func about() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "Bloch Space", .applicationVersion: "1.1.0", .credits: NSAttributedString(string: "Bloch Inc · Multichain Intelligence\nBloch · Ethereum · Bitcoin\nLive sources and private features require an Internet connection.")]) }

    func item(_ title: String, _ action: Selector?, _ key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        return item
    }
    func buildMenu() {
        let bar = NSMenu()
        let appMenu = NSMenu(), appItem = NSMenuItem()
        appMenu.addItem(item("About Bloch Space", #selector(about)))
        appMenu.addItem(.separator())
        appMenu.addItem(item("Quit Bloch Space", #selector(NSApplication.terminate(_:)), "q")); appMenu.items.last?.target = NSApp
        appItem.submenu = appMenu; bar.addItem(appItem)
        let edit = NSMenu(title: "Edit"), editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        for (title, selector, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(NSMenuItem(title: title, action: Selector(selector), keyEquivalent: key))
        }
        editItem.submenu = edit; bar.addItem(editItem)
        let view = NSMenu(title: "Workspace"), viewItem = NSMenuItem(title: "Workspace", action: nil, keyEquivalent: "")
        view.addItem(item("Home", #selector(home), "h"))
        view.addItem(item("Back", #selector(back), "[")); view.addItem(item("Forward", #selector(forward), "]"))
        view.addItem(item("Refresh", #selector(reload), "r")); view.addItem(item("Open in Browser", #selector(openBrowser), "b"))
        view.addItem(.separator())
        for (i, n) in ["bloch", "ethereum", "bitcoin"].enumerated() {
            let entry = item(n.capitalized + " Data Science", #selector(network(_:)), String(i + 1))
            entry.representedObject = "/app/?network=\(n)&view=science&range=\(["bloch":"24h", "ethereum":"48", "bitcoin":"30"][n]!)"
            view.addItem(entry)
        }
        view.addItem(item("BI-PoRB Account", #selector(account), "4"))
        view.addItem(item("Graph Lab", #selector(graphLab), "5"))
        viewItem.submenu = view; bar.addItem(viewItem)
        let windowMenu = NSMenu(title: "Window"), windowItem = NSMenuItem(title: "Window", action: nil, keyEquivalent: "")
        windowMenu.addItem(NSMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        windowItem.submenu = windowMenu; bar.addItem(windowItem); NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = bar
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "blob", url.absoluteString.hasPrefix("blob:https://bloch.space/") { decisionHandler(.download); return }
        if url.scheme == "https", url.host == "bloch.space", url.port == nil || url.port == 443 {
            decisionHandler(action.shouldPerformDownload ? .download : .allow); return
        }
        if url.isFileURL, url == Bundle.main.url(forResource: "offline", withExtension: "html") { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated, url.scheme == "https", let host = url.host, externalHosts.contains(host) { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, url.scheme == "https" {
            if url.host == "bloch.space" { webView.load(action.request) }
            else if let host = url.host, externalHosts.contains(host) { NSWorkspace.shared.open(url) }
        }
        return nil
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        if let offline = Bundle.main.url(forResource: "offline", withExtension: "html") { web.loadFileURL(offline, allowingReadAccessTo: offline.deletingLastPathComponent()) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = (suggestedFilename as NSString).lastPathComponent
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let alert = NSAlert(); alert.messageText = "Download unavailable"; alert.informativeText = "Please retry the export, or use Workspace → Open in Browser."; alert.beginSheetModal(for: window)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
