const Cc = Components.classes;
const Ci = Components.interfaces;
const Cm = Components.manager;

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');

function AboutTabs() {}

AboutTabs.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
  classDescription: 'about:tabs',
  classID: Components.ID('{21dfe065-bb20-4f02-a969-e4bf3cf73e90}'),
  contractID: '@mozilla.org/network/protocol/about;1?what=tabs',

  newChannel: function(uri)
  {
    var channel = Services.io.newChannel('resource://tabstats/abouttabs.html', null, null);
    var securityManager = Cc['@mozilla.org/scriptsecuritymanager;1'].getService(Ci.nsIScriptSecurityManager);
    var principal = securityManager.getSystemPrincipal(uri);
    channel.originalURI = uri;
    channel.owner = principal;
    return channel;
  },

  getURIFlags: function(uri)
  {
    return Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT | Ci.nsIAboutModule.ALLOW_SCRIPT;
  }
};

const AboutTabsFactory = XPCOMUtils.generateNSGetFactory([AboutTabs])(AboutTabs.prototype.classID);

function startup(aData, aReason) {
  Cm.registerFactory(AboutTabs.prototype.classID,
                     AboutTabs.prototype.classDescription,
                     AboutTabs.prototype.contractID,
                     AboutTabsFactory);
  var fileuri = Services.io.newFileURI(aData.installPath);
  if (!aData.installPath.isDirectory())
    fileuri = Services.io.newURI('jar:' + fileuri.spec + '!/', null, null);
  Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('tabstats', fileuri);
}

function shutdown(aData, aReason) {
  Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('tabstats', null);
  Cm.unregisterFactory(AboutTabs.prototype.classID, AboutTabsFactory);
}
function install(aData, aReason) { }
function uninstall(aData, aReason) { }
