function openAboutTabs() {
  browser.tabs.create({url: browser.extension.getURL("abouttabs.html")});
}
browser.browserAction.onClicked.addListener(openAboutTabs);
