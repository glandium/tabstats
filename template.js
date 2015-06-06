const kNSXUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

var templates = {};

function empty(obj) {
  for (var k in obj) {
    if (k) {
      return false;
    }
  }
  return true;
}

var Template = function (template_node) {
  this._template = template_node.content;
}

Template.prototype = {
  instantiate: function (doc, values) {
    return this._instantiate(doc, values, this._template);
  },

  _instantiate: function (doc, values, node) {
    var newNode;
    if (node.nodeType == Node.ELEMENT_NODE) {
      var condition = node.getAttribute('template-if');
      if (condition && !format(condition, values)) {
        return undefined;
      }
      if (node.localName.toLowerCase().startsWith('xul:')) {
        newNode = doc.createElementNS(kNSXUL, node.localName.slice(4));
      } else {
        newNode = doc.createElementNS(node.namespaceURI, node.localName);
      }
      for (var n of node.attributes) {
        if (n.name.startsWith('on')) {
          var handler = format(n.value, values);
          if (typeof handler == 'string') {
            newNode.setAttribute(n.name, handler);
          } else {
            newNode.addEventListener(n.name.slice(2),
              format(n.value, values), false);
          }
        } else if (n.name != 'template-if') {
          var value = format(n.value, values);
          if (value && typeof value != 'string') {
            value = JSON.stringify(value);
          }
          newNode.setAttribute(n.name, value ? value : '');
        }
      }
    } else if (node.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
      newNode = doc.createDocumentFragment();
    }
    for (var n of node.childNodes) {
      if (n.nodeType == Node.ELEMENT_NODE) {
        var subNode = this._instantiate(doc, values, n);
        if (subNode) {
          newNode.appendChild(subNode);
        }
      } else if (n.nodeType == Node.TEXT_NODE) {
        var text = format(n.nodeValue, values);
        if (text && typeof text != 'string') {
          text = JSON.stringify(text);
        }
        if (text) {
          newNode.appendChild(doc.createTextNode(text));
        }
      }
    }
    return newNode;
  },
};

function plural(n, noun) {
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

// format('${n}_dog ${k}_horse', {n: 2, k: 1}) => "2 dogs 1 horse"
// format('${n}_happy_dog', {n: 4}) => "4 happy dogs"
// format('${n}_dog ${n}?(has|have) fleas', {n: 1}) => "1 dog has fleas"
// format('${n}_dog ${n}?(has|have) fleas', {n: 2}) => "2 dogs have fleas"
// format('${n}_unique_${thing}', {n: 2, thing: 'thing'}) => "2 unique things"
// format('${foo} is ${bar}', {foo: 'a', bar: 'b'}) => "a is b"
// format('${n} ${bar}', {n: 2, bar: 'http'}) => "2 http"
function format(str, values) {
  if (str.indexOf('${') == -1) {
    return str;
  }
  var template = str.split(/\$\{(\w+)\}/g);
  if (template.length == 1) {
    return str;
  }
  if (template.length == 3 && !template[0] && !template[2]) {
    return values[template[1]];
  }
  var s = template[0]
  for (var i = 1; i < template.length; i += 2) {
    var n = template[i] ? values[template[i]] : '';
    var fragment = template[i+1];
    if (typeof n == 'string') {
      s += n + fragment;
      continue;
    }
    if (fragment.charAt(0) == '_') {
      if (fragment.slice(-1) == '_') {
        s += n + fragment.replace(/_/g, ' ')
               + plural(n, values[template[i+2]]);
        template[i+2] = '';
      } else {
        s += n + fragment.replace(/^([\w_]*)([^_\W])+/, (_, before, word) =>
                                  before.replace(/_/g, ' ') + plural(n, word));
      }
    } else if (fragment.charAt(0) == '?') {
      s += fragment.replace(/\?\((.*?)\|(.*)\)/, (_, a, b) => (n == 1) ? a : b);
    } else {
      s += n + fragment;
    }
  }
  return s;
}

function init() {
  for (var template of document.getElementsByTagName('template')) {
    templates[template.id] = new Template(template);
  }
}

window.addEventListener("load", init, false);
