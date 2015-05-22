const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

const kNSXUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
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

function createUniqueTabList(what, data, dupes, keys_are_urls) {
  var li = document.createElement('li');
  li.appendChild(document.createTextNode(en`${dupes.length} ${what} in more than 1 tab: `));
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
    var sub_li = document.createElement('li');
    var div = document.createElement('div');
    sub_li.appendChild(div);

    var sub_div = document.createElement('div');
    sub_div.setAttribute('class', 'title');

    var favicons = new Set((for (tab of data[k]) if (tab.image) tab.image));

    var img = document.createElementNS(kNSXUL, 'image');
    img.setAttribute('validate', 'never');
    if (favicons.size == 1) {
      var [src] = favicons.values();
      img.setAttribute('src', src);
    } else {
      img.setAttribute('src', kDefaultFavicon);
    }
    div.appendChild(img);

    var title;
    if (keys_are_urls) {
      var titles = new Set((for (tab of data[k]) tab.label));
      if (titles.size == 1) {
        [title] = titles.values();
      }
    }
    if (!title)
      title = k;

    sub_div.appendChild(document.createTextNode(' ' + title));
    div.appendChild(sub_div);

    sub_div = document.createElement('div');
    sub_div.setAttribute('class', 'actions');
    sub_div.appendChild(document.createTextNode(en`(${data[k].length} tab) `));
    if (keys_are_urls) {
      sub_div.appendChild(create_close_link(data, k, true, '[Dedup]'));
      sub_div.appendChild(document.createTextNode(' '));
    }
    sub_div.appendChild(create_close_link(data, k, false, '[Close]'));
    div.appendChild(sub_div);

    if (keys_are_urls && title != k) {
      sub_div = document.createElement('div');
      sub_div.setAttribute('class', 'url');
      sub_div.appendChild(document.createTextNode(k));
      sub_li.appendChild(sub_div);
    }

    ul.appendChild(sub_li);
  });
  li.appendChild(ul);
  return li;
}

function createTabList(what, data, keys_are_urls) {
  var numUnique = 0;
  for (key in data)
    numUnique++;

  var li = document.createElement('li');
  li.appendChild(document.createTextNode(en`${numUnique} unique__${what}`));

  var ul = document.createElement('ul');
  li.appendChild(ul);

  var dupes = [k for (k in data) if (data[k].length > 1)];
  if (dupes.length) {
    ul.appendChild(createUniqueTabList(what, data, dupes, keys_are_urls));
    var sub_li = document.createElement('li');
    sub_li.appendChild(document.createTextNode(en`${numUnique - dupes.length} other__${what}`));
    ul.appendChild(sub_li);
  }

  return li;
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

  for (key in schemes) {
    var sub_li = document.createElement("li");
    sub_li.appendChild(document.createTextNode(schemes[key]+ " " + key + ":"));
    ul.appendChild(sub_li);
  }

  if (blankTabs) {
    li = document.createElement("li");
    li.appendChild(document.createTextNode(en`${blankTabs} empty__tab`));
    ul.appendChild(li);
  }

  ul.appendChild(createTabList('address', uris, true));
  ul.appendChild(createTabList('host', hosts, false));
}

window.addEventListener("load", refresh, false);
