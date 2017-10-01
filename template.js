/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  instantiate: function (parentNode, values) {
    if (typeof values == 'function') {
      for (var item of values()) {
        parentNode.appendChild(this._instantiate(item, this._template));
      }
    } else {
      parentNode.appendChild(this._instantiate(values, this._template));
    }
  },

  _instantiate: function (values, node) {
    var newNode;
    if (node.nodeType == Node.ELEMENT_NODE) {
      var condition = node.getAttribute('template-if');
      if (condition && !format(condition, values)) {
        return undefined;
      }
      if (node.localName == 'apply') {
        newNode = document.createDocumentFragment();
      } else if (node.localName.toLowerCase().startsWith('xul:')) {
        newNode = document.createElementNS(kNSXUL, node.localName.slice(4));
      } else {
        newNode = document.createElementNS(node.namespaceURI, node.localName);
      }
      for (var n of node.attributes) {
        if (n.name.startsWith('event-')) {
          var handler = get_value(n.value, values);
          if (handler === n.value) {
            newNode.addEventListener(n.name.slice(6),
              eval(`(function handler(){${n.value}})`), false);
          } else {
            newNode.addEventListener(n.name.slice(6),
              format(n.value, values), false);
          }
        } else if (!n.name.startsWith('template')) {
          var value = format(n.value, values);
          if (value && typeof value != 'string') {
            value = JSON.stringify(value);
          }
          newNode.setAttribute(n.name, value ? value : '');
        }
      }
    } else if (node.nodeType == Node.DOCUMENT_FRAGMENT_NODE) {
      newNode = document.createDocumentFragment();
    }
    for (var n of node.childNodes) {
      if (n.nodeType == Node.ELEMENT_NODE) {
        var subNode = this._instantiate(values, n);
        if (subNode) {
          newNode.appendChild(subNode);
        }
      } else if (n.nodeType == Node.TEXT_NODE) {
        var text = format(n.nodeValue, values);
        if (text && typeof text != 'string') {
          text = JSON.stringify(text);
        }
        if (text && text.match(/\S/)) {
          newNode.appendChild(document.createTextNode(text));
        }
      }
    }
    if (node.nodeType == Node.ELEMENT_NODE) {
      var template = node.getAttribute('template-delay');
      var delay = !!template;
      if (!template) {
        template = node.getAttribute('template');
      }
      if (template) {
        template = templates[template];
      }
      if (template) {
        var data = node.getAttribute('template-data');
        if (delay) {
          newNode.instantiate = function () {
            var d = data ? format(data, values) : values;
            template.instantiate(this, d);
            delete this.instantiate;
          }
        } else {
          data = data ? format(data, values) : values;
          template.instantiate(newNode, data);
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

function _get_value(values, expr) {
  var and = expr.split(/\s*&&\s*/);
  if (and.length > 1) {
    for (var expr of and) {
      if (!_get_value(values, expr))
        return false;
    }
    return true;
  }
  if (expr.charAt(0) == '!') {
    return !_get_value(values, expr.slice(1));
  }
  var name = expr.split('.', 1)[0];
  if (name == expr) {
    var ret = values[expr];
    if (typeof ret == 'function') {
      ret = ret.bind(values);
    }
    return ret;
  } else {
    return _get_value(values[name], expr.slice(name.length + 1));
  }
}

function get_value(str, values) {
  if (str.startsWith('${') && str.endsWith('}')) {
    return _get_value(values, str.slice(2, -1));
  }
  return str;
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
  var template = str.split(/\$\{(\!*[\w\.]+(?:\s*&&\s*\!*[\w\.]+)*)\}/g);
  if (template.length == 1) {
    return str;
  }
  if (template.length == 3 && !template[0] && !template[2]) {
    return _get_value(values, template[1]);
  }
  var s = template[0]
  for (var i = 1; i < template.length; i += 2) {
    var n = template[i] ? _get_value(values, template[i]) : '';
    var fragment = template[i+1];
    if (typeof n == 'string') {
      s += n + fragment;
      continue;
    }
    if (fragment.charAt(0) == '_') {
      if (fragment.slice(-1) == '_') {
        s += n + fragment.replace(/_/g, ' ')
               + plural(n, _get_value(values, template[i+2]));
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
