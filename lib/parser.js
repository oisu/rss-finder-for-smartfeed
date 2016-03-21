'use strict';

var htmlparser = require('htmlparser2');
var FeedParser = require('feedparser');
var Promise = require('pinkie-promise');
var Iconv = require('iconv').Iconv;

var rssTypes = [
    'application/rss+xml',
    'application/atom+xml',
    'application/rdf+xml',
    'application/rss',
    'application/atom',
    'application/rdf',
    'text/rss+xml',
    'text/atom+xml',
    'text/rdf+xml',
    'text/rss',
    'text/atom',
    'text/rdf'
];

var iconRels = [
    'icon',
    'shortcut icon'
];

function _convertCharset(header, buf) {
    var charset = null;
    var re = [];
    var contentType = header['content-type'];
    var bin = null;
    var ic;
    var buf2;
    var str;

    if (contentType) {
        re = contentType.match(/\bcharset=([\w\-]+)\b/i);
        if (re) {
            charset = re[1];
        }
    }

    if (!charset) {
        bin = buf.toString('binary');
        re = bin.match(/<meta\b[^>]*charset=([\w\-]+)/i);
        if (re) {
            charset = re[1];
        } else {
            charset = 'utf-8';
        }
    }

    switch (charset) {
    case 'ascii':
    case 'utf-8':
        return buf.toString(charset);

    default:
        ic = new Iconv(charset, 'utf-8//TRANSLIT//IGNORE');
        buf2 = ic.convert(buf);
        str = buf2.toString('utf8');
        return str;
    }
}

function htmlParser(htmlBodyBuf, htmlHeader, feedParserOptions) {
    return new Promise(function(resolve, reject) {
        var rs = {};
        var feeds = [];
        var parser;
        var isFeeds;
        var favicon;
        var isSiteTitle;
        var siteTitle;
        var feedParser;
        var htmlBody;
        var isDupFeed;

        parser = new htmlparser.Parser({
            onopentag: function(name, attr) {
                if (/(feed)|(atom)|(rdf)|(rss)/.test(name)) {
                    isFeeds = true;
                }

                if (name === 'link' && (rssTypes.indexOf(attr.type) !== -1)) {
                    feeds.push({
                        title: attr.title || null,
                        url: attr.href || null
                    });
                }

                if (name === 'link' && (iconRels.indexOf(attr.rel) !== -1 || attr.type === 'image/x-icon')) {
                    favicon = attr.href;
                }

                if (name === 'a' && /(feed)|(rdf)|(rss)$/.test(attr.href)) {
                    isDupFeed = false;
                    feeds.forEach(function(val, index) {
                        if (feeds[index].title === siteTitle) {
                            isDupFeed = true;
                        }
                    });
                    if (isDupFeed) {
                        isDupFeed = false;
                    } else {
                        feeds.push({
                            title: siteTitle,
                            url: attr.href
                        });
                    }
                }

                if (name === 'title') {
                    isSiteTitle = true;
                    return isSiteTitle;
                }
            },
            ontext: function(text) {
                if (isSiteTitle) {
                    siteTitle = text;
                    return siteTitle;
                }
            },
            onclosetag: function(name) {
                if (name === 'title') {
                    isSiteTitle = false;
                    return isSiteTitle;
                }
            }
        }, {
            recognizeCDATA: true
        });

        htmlBody = _convertCharset(htmlHeader, htmlBodyBuf);

        parser.write(htmlBody);
        parser.end();

        if (isFeeds) {
            feedParser = new FeedParser(feedParserOptions);

            feeds = [];

            feedParser.on('error', function(err) {
                reject(err);
                return;
            });

            feedParser.on('readable', function() {
                var data;

                if (feeds.length === 0) {
                    data = this.meta;
                    return feeds.push(data);
                }
            });

            feedParser.write(htmlBody);

            return feedParser.end(function() {
                if (feeds.length !== 0) {
                    rs.site = {
                        title: feeds[0].title || null,
                        favicon: feeds[0].favicon || null,
                        url: feeds[0].link || null
                    };

                    rs.feedUrls = [{
                        title: feeds[0].title || null,
                        url: feeds[0].xmlUrl || null
                    }];
                }

                resolve(rs);
            });
        }

        rs.site = {
            title: siteTitle || null,
            favicon: favicon || null
        };

        rs.feedUrls = feeds;

        resolve(rs);
    });
}

module.exports = htmlParser;
