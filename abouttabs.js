const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

function init() {
  var ul = document.getElementById("stats");
  var windows = Services.wm.getEnumerator("navigator:browser");
  var windowsCount = 0;
  var tabGroupsCount = 0;
  var tabs = [];
  while (windows.hasMoreElements()) {
    windowsCount++;
    var win = windows.getNext();
    try {
      var removingTabs = win.gBrowser._removingTabs;
      tabs.push.apply(tabs, Array.filter(win.gBrowser.tabs, function (tab) {
        return removingTabs.indexOf(tab) == -1;
      }));
    } catch(e) {
      tabs.push.apply(tabs, win.gBrowser.tabs);
    }
    try {
      /* Newly opened windows don't return anything for TabView.getContentWindow() */
      tabGroupsCount += win.TabView.getContentWindow().GroupItems.groupItems.length;
    } catch(e) {
      tabGroupsCount++;
    }
  }
  var li = document.createElement("li");
  li.appendChild(document.createTextNode(tabs.length + " tab"+ (tabs.length > 1 ? "s" : "") + " across " + tabGroupsCount + " group" + (tabGroupsCount > 1 ? "s" : "") +  " in " + windowsCount + " window" + (windowsCount > 1 ? "s" : "")));
  ul.appendChild(li);

  var uris = {};
  var hosts = {};
  var schemes = {};
  var blankTabs = 0;
  var loadedTabs = 0;
  tabs.forEach(function(tab) {
    var uri = tab.linkedBrowser.currentURI;
    if (uri.spec == "about:blank") {
      blankTabs++
      return;
    }
    if (!"__SS_restoreState" in tab.linkedBrowser || tab.linkedBrowser.__SS_restoreState != 1)
      loadedTabs++;
    if (uri.spec in uris)
      uris[uri.spec]++;
    else
      uris[uri.spec] = 1;
    try {
      if (uri.host) {
        if (uri.host in hosts)
          hosts[uri.host]++;
        else
          hosts[uri.host] = 1;
      }
    } catch(e) {}
    if (uri.scheme in schemes)
      schemes[uri.scheme]++;
    else
      schemes[uri.scheme] = 1;
  });
  var uniqueUris = 0;
  var uniqueHosts = 0;
  for (key in uris)
    uniqueUris++;
  for (key in hosts)
    uniqueHosts++;

  li = document.createElement("li");
  li.appendChild(document.createTextNode(loadedTabs + " tab" + (loadedTabs > 1 ? "s" : "") + " ha" + (loadedTabs > 1 ? "ve" : "s") + " been loaded"));
  ul.appendChild(li);

  li = document.createElement("li");
  li.appendChild(document.createTextNode(uniqueUris + " unique address" + (uniqueUris > 1 ? "es" : "")));
  ul.appendChild(li);

  li = document.createElement("li");
  li.appendChild(document.createTextNode(uniqueHosts + " unique host" + (uniqueHosts > 1 ? "s" : "")));
  ul.appendChild(li);

  if (blankTabs) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(blankTabs + " empty tab" + (blankTabs > 1 ? "s" : "")));
    ul.appendChild(li);
  }

  for (key in schemes) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(schemes[key]+ " " + key + ":"));
    ul.appendChild(li);
  }

  var uris_ = [uri for (uri in uris) if (uris[uri] > 1)];
  if (uris_.length) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(uris_.length + " address" + (uris_.length > 1 ? "es" : "") + " in more than 1 tab:"));
    var sub_ul = document.createElement("ul");
    var sub_li;
    uris_.sort(function cmp(a, b) {
      if (uris[a] < uris[b])
        return 1;
      if (uris[a] > uris[b])
        return -1;
      return 0;
    }).forEach(function(uri) {
      sub_li = document.createElement("li");
      sub_li.appendChild(document.createTextNode(uri+" ("+uris[uri] + " tabs)"));
      sub_ul.appendChild(sub_li);
    });
    li.appendChild(sub_ul);
    ul.appendChild(li);
  }

  var hosts_ = [host for (host in hosts) if (hosts[host] > 1)];
  if (hosts_.length) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(hosts_.length + " host" + (hosts_.length > 1 ? "s" : "") + " in more than 1 tab:"));
    var sub_ul = document.createElement("ul");
    var sub_li;
    hosts_.sort(function cmp(a, b) {
      if (hosts[a] < hosts[b])
        return 1;
      if (hosts[a] > hosts[b])
        return -1;
      return 0;
    }).forEach(function(host) {
      sub_li = document.createElement("li");
      sub_li.appendChild(document.createTextNode(host+" ("+hosts[host] + " tabs)"));
      sub_ul.appendChild(sub_li);
    });
    li.appendChild(sub_ul);
    ul.appendChild(li);
  }
}

window.addEventListener("load", init, false);
