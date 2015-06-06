const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

const kDefaultFavicon = 'chrome://mozapps/skin/places/defaultFavicon.png';

function close(dict, key, keep_one) {
  if (key === undefined) {
    for (key in dict)
      close(dict, key, keep_one);
    return;
  }
  var tabs = dict[key];
  if (keep_one) {
    tabs.sort(function(a, b) {
      time_a = a.lastAccessed;
      time_b = b.lastAccessed;
      if (time_a > time_b)
        return -1;
      if (time_b > time_a)
        return 1;
      return 0;
    });
  }
  for (var tab of tabs) {
    if (keep_one) {
      keep_one = false;
      continue;
    }
    tab.ownerGlobal.gBrowser.removeTab(tab);
  }
}

function create_event_handler(dict, key, keep_one) {
  return function () {
    close(dict, key, keep_one);
    refresh();
  }
}

function create_close_link(dict, key, keep_one, label) {
  var a = document.createElement("a");
  a.href = '#';
  a.onclick = create_event_handler(dict, key, keep_one);
  a.appendChild(document.createTextNode(label));
  return a;
}

function replaceFirstChild(parent, newChild) {
  if (parent.firstChild) {
    parent.replaceChild(newChild, parent.firstChild);
  } else {
    parent.appendChild(newChild);
  }
}

function createUniqueTabList(what, data, dupes, keys_are_urls) {
  var li = document.createElement('li');
  li.appendChild(document.createTextNode(format('${num}_${what} in more than 1 tab: ', {num: dupes.length, what: what})));
  if (keys_are_urls) {
    li.appendChild(create_close_link(data, undefined, true, '[Dedup]'));
    li.appendChild(document.createTextNode(' '));
  }
  li.appendChild(create_close_link(data, undefined, false, '[Close]'));

  var ul = document.createElement('ul');
  ul.setAttribute('class', plural(2, what));
  dupes.sort(function cmp(a, b) {
    if (data[a].length < data[b].length)
      return 1;
    if (data[a].length > data[b].length)
      return -1;
    return 0;
  }).forEach(function(k) {
    var favicons = new Set((tab.image for (tab of data[k])));
    var src;
    if (favicons.size == 1) {
      [src] = favicons.values();
    }
    if (!src)
      src = kDefaultFavicon;

    var title;
    if (keys_are_urls) {
      var titles = new Set((tab.label for (tab of data[k])));
      if (titles.size == 1) {
        [title] = titles.values();
      }
    }
    if (!title)
      title = k;

    ul.appendChild(templates.duplicates.instantiate(document, {
      'title': title,
      'num_tabs': data[k].length,
      'url': (keys_are_urls && title != k) ? k : undefined,
      'favicon': src,
      'dedup': keys_are_urls ? create_event_handler(data, k, true) : undefined,
      'close': create_event_handler(data, k, false),
    }));
  });
  li.appendChild(ul);
  return li;
}

function createTabList(what, data, keys_are_urls) {
  var numUnique = 0;
  for (key in data)
    numUnique++;

  var li = document.createElement('li');
  li.appendChild(document.createTextNode(format('${numUnique}_unique_${what}', {numUnique: numUnique, what: what})));

  var ul = document.createElement('ul');
  li.appendChild(ul);

  var dupes = [k for (k in data) if (data[k].length > 1)];
  if (dupes.length) {
    ul.appendChild(createUniqueTabList(what, data, dupes, keys_are_urls));
    var sub_li = document.createElement('li');
    sub_li.appendChild(document.createTextNode(format('${num}_other_${what}', {num: numUnique - dupes.length, what: what})));
    ul.appendChild(sub_li);
  }

  return li;
}

function refresh() {
  var windows = Services.wm.getEnumerator("navigator:browser");
  var windowsCount = 0;
  var tabGroupsCount = 0;
  var tabs = [];
  while (windows.hasMoreElements()) {
    windowsCount++;
    var win = windows.getNext();
    var win_tabs = win.gBrowser.tabs;
    try {
      var removingTabs = win.gBrowser._removingTabs;
      win_tabs = Array.filter(win_tabs, function (tab) {
        return removingTabs.indexOf(tab) == -1;
      });
    } catch(e) {}
    var groups = new Set();
    win_tabs.forEach(function(tab) {
      try {
        groups.add(JSON.parse(tab.__SS_extdata['tabview-tab']).groupID);
      } catch(e) {}
    });
    tabGroupsCount += Math.max(1, groups.size);
    tabs.push.apply(tabs, win_tabs);
  }

  var body = document.body;

  while (body.firstChild)
    body.removeChild(body.firstChild);

  var data = {
    tabCount: tabs.length,
    windowsCount: windowsCount,
    tabGroupsCount: tabGroupsCount,
  }
  body.appendChild(templates.main.instantiate(document, data));

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
  li.appendChild(document.createTextNode(format('${loadedTabs}_tab ${loadedTabs}?(has|have) been loaded', {loadedTabs: loadedTabs})));
  var ul = document.getElementById("stats");
  ul.appendChild(li);

  li = document.createElement("li");
  li.setAttribute("class", "schemes");
  for (key of Object.keys(schemes).sort()) {
    var span = document.createElement("span");
    span.appendChild(document.createTextNode(schemes[key]+ " " + key + ":"));
    li.appendChild(span);
  }
  ul.appendChild(li);

  if (blankTabs) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(format('${blankTabs}_empty_tab', {blankTabs: blankTabs})));
    ul.appendChild(li);
  }

  ul.appendChild(createTabList('address', uris, true));
  ul.appendChild(createTabList('host', hosts, false));
}

window.addEventListener("load", refresh, false);
