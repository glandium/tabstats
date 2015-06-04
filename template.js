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
          newNode.addEventListener(n.name.slice(2),
            format(n.value, values), false);
        } else if (n.name != 'template-if') {
          newNode.setAttribute(n.name, format(n.value, values));
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
        if (text) {
          newNode.appendChild(doc.createTextNode(text));
        }
      }
    }
    return newNode;
  },
};

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
  return _en(strings, values);
}

function _en(strings, values) {
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
  var strings = [];
  var vals = [];
  var i = 0;
  for (var s of template) {
    if (++i % 2) {
      strings.push(s);
    } else {
      var val = values[s];
      vals.push(val === undefined ? '' : val);
    }
  }
  return _en(strings, vals);
}

function init() {
  for (var template of document.getElementsByTagName('template')) {
    templates[template.id] = new Template(template);
  }
}

window.addEventListener("load", init, false);
