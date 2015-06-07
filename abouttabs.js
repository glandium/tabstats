const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

var TabList = function () {
  this.push.apply(this, arguments);
};

TabList.prototype = Object.create(Array.prototype, {
  close_or_dedup: { value: function (keep_one) {
    for (var tab of (keep_one ? this.byLastAccessed() : this)) {
      if (keep_one) {
        keep_one = false;
        continue;
      }
      tab.ownerGlobal.gBrowser.removeTab(tab);
    }
    refresh();
  }},

  close: { value: function () {
    this.close_or_dedup(false);
  }},

  byLastAccessed: { value: function* () {
    var sorted = this.slice();
    sorted.sort(function(a, b) {
      time_a = a.lastAccessed;
      time_b = b.lastAccessed;
      if (time_a > time_b)
        return -1;
      if (time_b > time_a)
        return 1;
      return 0;
    });
    for (var tab of sorted) {
      yield tab;
    }
  }},
});

var DedupableTabList = function () {
  TabList.apply(this, arguments);
};

DedupableTabList.prototype = Object.create(TabList.prototype, {
  dedup: { value: function () {
    this.close_or_dedup(true);
  }},
});

var TabGroup = function () {
};

function _tabGroupMethod(name) {
  return function () {
    for (var group in this) {
      this[group][name]();
    }
  }
}

TabGroup.prototype = Object.create(Object.prototype, {
  close: { value: _tabGroupMethod('close') },

  byLength: { value: function* () {
    var sorted = Object.keys(this);
    var that = this;
    sorted.sort(function(a, b) {
      if (that[a].length < that[b].length)
        return 1;
      if (that[a].length > that[b].length)
        return -1;
      return 0;
    });
    for (var key of sorted) {
      yield { key: key, value: this[key] };
    }
  }},
});

var DedupableTabGroup = function () {
};

DedupableTabGroup.prototype = Object.create(TabGroup.prototype, {
  dedup: { value: _tabGroupMethod('dedup') },
});

var TabCollection = function (what) {
  this.what = what;
  this.unique = {};
  this.numUnique = 0;
  this.dupes = (what == 'address' ? new DedupableTabGroup() : new TabGroup());
  this.numDupes = 0;
};

TabCollection.prototype = {
  get length () {
    return this.numUnique + this.numDupes;
  },

  add: function(key, tab) {
    if (this.unique && key in this.unique) {
      var otherTab = this.unique[key];
      var dupes = this.dupes[key] = new DedupableTabList(otherTab, tab);
      dupes.favicon = tab.image == otherTab.image ? tab.image : undefined;
      if (this.what == 'address') {
        dupes.title = tab.label == otherTab.label ? tab.label : undefined;
        dupes.url = key;
      }
      this.numDupes++;
      delete this.unique[key];
      this.numUnique--;
    } else if (this.dupes && key in this.dupes) {
      var dupes = this.dupes[key];
      dupes.push(tab);
      if (dupes.favicon != tab.image) {
        delete dupes.favicon;
      }
      if (dupes.title != tab.label) {
        delete dupes.title;
      }
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
    uris: new TabCollection('address'),
    hosts: new TabCollection('host'),
  }

  tabs.forEach(function(tab) {
    var uri = tab.linkedBrowser.currentURI;
    if (uri.spec == "about:blank") {
      data.blankTabs++
      return;
    }
    if (!"__SS_restoreState" in tab.linkedBrowser || tab.linkedBrowser.__SS_restoreState != 1)
      data.loadedTabs++;
    data.uris.add(uri.spec, tab);
    try {
      if (uri.host) {
        data.hosts.add(uri.host, tab);
      }
    } catch(e) {}
    if (uri.scheme in data.schemes)
      data.schemes[uri.scheme]++;
    else
      data.schemes[uri.scheme] = 1;
  });

  body.appendChild(templates.main.instantiate(document, data));
}

window.addEventListener("load", refresh, false);
