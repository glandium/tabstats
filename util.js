/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MyDate = function (timestamp, lightweight=false) {
  this.timestamp = timestamp;
  this.date = new Date(timestamp);

  var year = this.date.getFullYear();
  var month = this.date.getMonth();
  this.month = year * 12 + month;

  if (!lightweight) {
    var first = new Date(year, month, 1);
    this.offsetFromFirst = timestamp - first.getTime();
  }
};

MyDate.prototype = {
  timeAgo: function (timestamp) {
    var delta = Math.trunc(this.timestamp - timestamp) / 1000;
    if (delta < 2419200) { /* 28 days / 4 weeks */
      if (delta < 60) {
        return 'less than a minute ago';
      } else if (delta < 120) {
        return 'about a minute ago';
      } else if (delta < 3600) {
        return Math.trunc(delta / 60) + ' minutes ago';
      } else if (delta < 7200) {
        return 'more than an hour ago';
      } else if (delta < 86400) { /* 1 day */
        return 'more than ' + Math.trunc(delta / 3600) + ' hours ago';
      } else if (delta < 172800) { /* 2 days */
        return 'more than a day ago';
      } else if (delta < 604800) { /* 1 week */
        return 'more than ' + Math.trunc(delta / 86400) + ' days ago';
      } else if (delta < 1209600) { /* 2 weeks */
        return 'more than a week ago';
      } else {
        return 'more than ' + Math.trunc(delta / 604800) + ' weeks ago';
      }
    } else {
      var other = new MyDate(timestamp - this.offsetFromFirst - 1, true);
      delta = this.month - other.month - 1;
      if (delta < 1) {
        return 'more than 4 weeks ago';
      } else if (delta == 1) {
        return 'more than a month ago';
      } else if (delta < 12) {
        return 'more than ' + delta + ' months ago';
      } else if (delta < 24) {
        return 'more than a year ago';
      } else {
        return 'more than ' + Math.trunc(delta / 12) + ' years ago';
      }
    }
  },
}
