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
  var numUnique = data.length;

  var li = document.createElement('li');
  li.appendChild(document.createTextNode(format('${numUnique}_unique_${what}', {numUnique: numUnique, what: what})));

  var ul = document.createElement('ul');
  li.appendChild(ul);

  if (data.numDupes) {
    ul.appendChild(createUniqueTabList(what, data.dupes, [k for (k in data.dupes)], keys_are_urls));
    var sub_li = document.createElement('li');
    sub_li.appendChild(document.createTextNode(format('${num}_other_${what}', {num: data.numUnique, what: what})));
    ul.appendChild(sub_li);
  }

  return li;
}

var TabList = function () {
  this.unique = {};
  this.numUnique = 0;
  this.dupes = {};
  this.numDupes = 0;
};

TabList.prototype = {
  get length () {
    return this.numUnique + this.numDupes;
  },

  add: function(key, tab) {
    if (this.unique && key in this.unique) {
      this.dupes[key] = [this.unique[key], tab];
      this.numDupes++;
      delete this.unique[key];
      this.numUnique--;
    } else if (this.dupes && key in this.dupes) {
      this.dupes[key].push(tab);
    } else {
      this.unique[key] = tab;
      this.numUnique++;
    }
  },
};

var Sortable = function () {
};

Sortable.prototype = Object.create(Object.prototype, {
  byKey: { value: function* () {
    for (var key of Object.keys(this).sort()) {
      yield { key: key, value: this[key] };
    }
  }},
});

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
    blankTabs: 0,
    loadedTabs: 0,
    schemes: new Sortable(),
  }

  var uris = new TabList();
  var hosts = new TabList();
  tabs.forEach(function(tab) {
    var uri = tab.linkedBrowser.currentURI;
    if (uri.spec == "about:blank") {
      data.blankTabs++
      return;
    }
    if (!"__SS_restoreState" in tab.linkedBrowser || tab.linkedBrowser.__SS_restoreState != 1)
      data.loadedTabs++;
    uris.add(uri.spec, tab);
    try {
      if (uri.host) {
        hosts.add(uri.host, tab);
      }
    } catch(e) {}
    if (uri.scheme in data.schemes)
      data.schemes[uri.scheme]++;
    else
      data.schemes[uri.scheme] = 1;
  });

  body.appendChild(templates.main.instantiate(document, data));

  var ul = document.getElementById("stats");

  ul.appendChild(createTabList('address', uris, true));
  ul.appendChild(createTabList('host', hosts, false));
}

window.addEventListener("load", refresh, false);
