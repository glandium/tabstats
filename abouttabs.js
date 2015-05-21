const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

function close(dict, key, keep_one) {
  if (key === undefined) {
    for (key in dict)
      close(dict, key, keep_one);
    return;
  }
  tabs = dict[key];
  if (keep_one) {
    tabs.sort(function(a, b) {
      time_a = a[0].lastAccess;
      time_b = b[0].lastAccess;
      if (time_a > time_b)
        return -1;
      if (time_b > time_a)
        return 1;
      return 0;
    });
  }
  for (tab of tabs) {
    if (keep_one) {
      keep_one = false;
      continue;
    }
    [tab, browser] = tab;
    browser.removeTab(tab);
  }
}

function create_close_link(dict, key, keep_one, label) {
  var a = document.createElement("a");
  a.href = '#';
  a.onclick = function () {
    close(dict, key, keep_one);
    refresh();
  }
  a.appendChild(document.createTextNode(label));
  return a;
}

function plural(n, noun) {
  noun = noun.replace(/__/g, " ");
  if (n == 1)
    return noun;
  if (noun.endsWith("s"))
    return noun + "es";
  if (noun.endsWith("sh"))
    return noun;
  if (noun.endsWith("ch"))
    return noun + "es";
  if (noun.endsWith("x"))
    return noun + "es";
  return noun + "s";
}

// en`${n} dog ${k} horse` => "2 dogs 1 horse"
// en`${n} happy__dog` => "4 happy dogs"
// en`${n} dog ${n}<has|have> fleas` => "1 dog has fleas"
// en`${n} unique__${thing}` => "2 unique things"
function en(strings, ...values) {
  var s = strings[0];
  for (var i = 0; i < values.length; i++) {
    var n = values[i];
    var fragment = strings[i+1];
    if (typeof n == 'string') {
      s += n + fragment;
      continue;
    }
    if (i + 1 < values.length && fragment.match(/(^\s*|\S)$/)) {
      s += n + plural(n, fragment + values[i+1]);
      values[i+1] = '';
    } else if (fragment.charAt(0) == '<')
      s += fragment.replace(/<(.*?)\|(.*)>/, (_, a, b) => (n == 1) ? a : b);
    else
      s += n + fragment.replace(/(\w+)/, (_, word) => plural(n, word));
  }
  return s;
}

function replaceFirstChild(parent, newChild) {
  if (parent.firstChild) {
    parent.replaceChild(newChild, parent.firstChild);
  } else {
    parent.appendChild(newChild);
  }
}

function refresh() {
  var ul = document.getElementById("stats");
  while (ul.firstChild)
    ul.removeChild(ul.firstChild);
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
    var groups = new Set();
    tabs.forEach(function(tab) {
      try {
        groups.add(JSON.parse(tab.__SS_extdata['tabview-tab']).groupID);
      } catch(e) {}
    });
    tabGroupsCount += groups.size;
  }

  var parent = document.getElementById("tabs");
  replaceFirstChild(parent, document.createTextNode(en`${tabs.length} tab`));

  parent = document.getElementById("windows");
  replaceFirstChild(parent, document.createTextNode(en`${windowsCount} window`));

  parent = document.getElementById("groups");
  replaceFirstChild(parent, document.createTextNode(en`${tabGroupsCount} tab__group`));

  var uris = {};
  var hosts = {};
  var urihosts = {};
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
    tab = [tab, win.gBrowser];
    if (uri.spec in uris)
      uris[uri.spec].push(tab);
    else
      uris[uri.spec] = [tab];
    try {
      if (uri.host) {
        if (uri.host in hosts)
          hosts[uri.host].push(tab);
        else {
          hosts[uri.host] = [tab];
          urihosts[uri.host] = {};
        }
        if (uri.spec in urihosts[uri.host])
          urihosts[uri.host][uri.spec]++;
        else
          urihosts[uri.host][uri.spec] = 1;
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
  li.appendChild(document.createTextNode(en`${loadedTabs} tab ${loadedTabs}<has|have> been loaded`));
  ul.appendChild(li);

  li = document.createElement("li");
  li.appendChild(document.createTextNode(en`${uniqueUris} unique__address`));
  ul.appendChild(li);

  li = document.createElement("li");
  li.appendChild(document.createTextNode(en`${uniqueHosts} unique__host`));
  ul.appendChild(li);

  if (blankTabs) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(en`${blankTabs} empty__tab`));
    ul.appendChild(li);
  }

  for (key in schemes) {
    var sub_li = document.createElement("li");
    sub_li.appendChild(document.createTextNode(schemes[key]+ " " + key + ":"));
    ul.appendChild(sub_li);
  }

  var uris_ = [uri for (uri in uris) if (uris[uri].length > 1)];
  if (uris_.length) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(en`${uris_.length} address` + " in more than 1 tab: "));
    li.appendChild(create_close_link(uris, undefined, true, "[Dedup]"));
    li.appendChild(document.createTextNode(" "));
    li.appendChild(create_close_link(uris, undefined, false, "[Close]"));
    var sub_ul = document.createElement("ul");
    var sub_li;
    uris_.sort(function cmp(a, b) {
      if (uris[a].length < uris[b].length)
        return 1;
      if (uris[a].length > uris[b].length)
        return -1;
      return 0;
    }).forEach(function(uri) {
      sub_li = document.createElement("li");
      sub_li.appendChild(document.createTextNode(uri+" ("+uris[uri].length + " tabs) "));
      sub_li.appendChild(create_close_link(uris, uri, true, "[Dedup]"));
      sub_li.appendChild(document.createTextNode(" "));
      sub_li.appendChild(create_close_link(uris, uri, false, "[Close]"));
      sub_ul.appendChild(sub_li);
    });
    li.appendChild(sub_ul);
    ul.appendChild(li);
  }

  var hosts_ = [host for (host in hosts) if (hosts[host].length > 1)];
  if (hosts_.length) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(en`${hosts_.length} host in more than 1 tab:`));
    var sub_ul = document.createElement("ul");
    var sub_li;
    hosts_.sort(function cmp(a, b) {
      if (hosts[a].length < hosts[b].length)
        return 1;
      if (hosts[a].length > hosts[b].length)
        return -1;
      return 0;
    }).forEach(function(host) {
      sub_li = document.createElement("li");
      var text = host+" (" + hosts[host].length + " tabs";
      var keys = Object.keys(urihosts[host]);
      if (keys.length < hosts[host].length)
        text += ", " + keys.length + " unique";
      text += ") ";
      sub_li.appendChild(document.createTextNode(text));
      sub_li.appendChild(create_close_link(hosts, host, false, "[Close]"));
      sub_ul.appendChild(sub_li);
    });
    li.appendChild(sub_ul);
    ul.appendChild(li);
  }
}

window.addEventListener("load", refresh, false);
