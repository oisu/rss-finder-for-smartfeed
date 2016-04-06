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

function _unescapeString(str) {
    return str.replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&raquo;/g, '»')
              .replace(/&mdash;/g, '—')
              .replace(/&ndash;/g, '–')
              .replace(/\n/g, '')
              .replace(/&amp;/g, '&');
}

function _convertUrlString(url) {
    return url.replace(/^feed:/, 'http:');
}

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
        var feedUrls = [];
        var feedsUrlsDupCheck = {};
        var feedsTitlesDupCheck = {};
        var parser;
        var isFeeds;
        var favicon;
        var description;
        var isSiteTitle;
        var siteTitle;
        var feedParser;
        var htmlBody;

        parser = new htmlparser.Parser({
            onopentag: function(name, attr) {
                var _pushFeedCheck = function(title, url) {
                    if (/((rss)|(xml)|(rdf)|(feed[s]?))\/?(\?(.*))?$/i.test(url)) {
                        feeds.push({
                            title: title,
                            url: url
                        });
                    }
                };

                // if url is feed url itself
                if (/(feed)|(atom)|(rdf)|(rss)/.test(name)) {
                    isFeeds = true;
                }

                if (name === 'a') {
                    _pushFeedCheck(null, attr.href);
                }

                if (name === 'link') {
                    if (rssTypes.indexOf(attr.type) !== -1) {
                        feeds.push({
                            title: attr.title,
                            url: attr.href
                        });
                    }
                    // favicon
                    if (iconRels.indexOf(attr.rel) !== -1 || attr.type === 'image/x-icon') {
                        favicon = attr.href;
                    }
                }

                // description
                if (name === 'meta') {
                    if (attr.name === 'description' || attr.property === 'og:description') {
                        description = attr.content;
                    }
                }

                // in order to get title tag text later
                if (name === 'title' && !siteTitle) {
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

        // site
        rs.site = {
            title: _unescapeString(siteTitle) || null,
            favicon: favicon || null,
            description: description || null
        };

        // feedUrls
        feeds.forEach(function(val, index) {
            var url = feeds[index].url;
            var title = feeds[index].title;

            if (!title || /^((rss)|(atom))$/i.test(val.title)) {
                title = siteTitle;
            }

            if (feedsUrlsDupCheck[url] || feedsTitlesDupCheck[title] || /^http:\/\/cloud\.feedly\.com/.test(url)) {
                feeds.splice(index, 1);
            } else {
                feedsUrlsDupCheck[url] = url;
                feedsTitlesDupCheck[title] = title;

                feedUrls.push({
                    url: _convertUrlString(url),
                    title: _unescapeString(title)
                });
            }
        });

        rs.feedUrls = feedUrls;

        resolve(rs);
    });
}

module.exports = htmlParser;
