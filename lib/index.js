'use strict';

var htmlParser = require('./parser');
var extend = require('extend');
var Promise = require('pinkie-promise');
var url = require('url');
var got = require('got');

var defaults = {
    gotOptions: {},
    feedParserOptions: {}
};

function isRelativeUrl(str) {
    return /^https?:\/\//i.test(str);
}

function setError(err) {
    if (err instanceof Error) {
        return err;
    }

    return new Error(err);
}

function cleanUrl(uri) {
    if (uri[uri.length - 1] === '/') {
        return uri.substr(0, uri.length - 1);
    }

    return uri;
}

function getFaviconUrl(uri) {
    var parsedUrl = url.parse(uri);

    return url.resolve(parsedUrl.protocol + '//' + parsedUrl.host, 'favicon.ico');
}

function fixData(res, uri) {
    return new Promise(function(resolve) {
        var feedUrl;
        var favicon;
        var i = res.feedUrls.length;

        var j = res.feedUrls.length;
        var feedUrlDictionary = {};
        var feedTitleDictionary = {};
        var feedUrlArray = [];


        while (i--) {
            feedUrl = res.feedUrls[i];

            if (feedUrl.url) {
                if (!isRelativeUrl(feedUrl.url)) {
                    feedUrl.url = url.resolve(uri, feedUrl.url);
                }
            } else {
                feedUrl.url = uri;
            }
        }

        // remove overlapped feed

        while (j--) {
            feedUrl = res.feedUrls[j];

            if (!(feedTitleDictionary[feedUrl.title] || feedUrlDictionary[feedUrl.url])) {
                feedUrlArray.unshift(feedUrl);
                feedUrlDictionary[feedUrl.url] = true;
                feedTitleDictionary[feedUrl.title] = true;
            }
        }
        res.feedUrls = feedUrlArray;

        if (!res.site.url) {
            res.site.url = cleanUrl(uri);
        }

        if (res.site.favicon) {
            if (!isRelativeUrl(res.site.favicon)) {
                res.site.favicon = url.resolve(res.site.url, res.site.favicon);
            }

            resolve(res);
        } else {
            favicon = getFaviconUrl(res.site.url);

            got(favicon, {
                retries: 0
            }).then(function() {
                res.site.favicon = favicon;
                resolve(res);
            }).catch(function() {
                resolve(res);
            });
        }
    });
}

function verifyUrl(res) {
    return new Promise(function(resolve) {
        var feedCount = 0;
        var filteredFeedUrls = [];

        if (res.feedUrls.length === 0) {
            resolve(res);
        }

        res.feedUrls.forEach(function(elm) {
            got(elm.url, {
                retries: 0
            }).then(function(feedContent) {
                if (feedContent.headers['content-type'].indexOf('xml') > 0) {
                    filteredFeedUrls.push(elm);
                }
                if (++feedCount === res.feedUrls.length) {
                    res.feedUrls = filteredFeedUrls;
                    resolve(res);
                }
            }).catch(function() {
                if (++feedCount === res.feedUrls.length) {
                    res.feedUrls = filteredFeedUrls;
                    resolve(res);
                }
            });
        });
    });
}

function rssFinder(opts) {
    return new Promise(function(resolve, reject) {
        var o = extend(true, {}, defaults);

        if (typeof opts === 'string') {
            o.url = opts;
        } else if (typeof opts === 'object' && !Array.isArray(opts)) {
            o = extend(true, {}, defaults, opts);
        } else {
            reject(setError('Parameter `opts` must be a string or object.'));
            return;
        }

        if (!isRelativeUrl(o.url)) {
            reject(setError('Not HTTP URL is provided.'));
            return;
        }

        o.gotOptions.encoding = null;

        got(o.url, o.gotOptions).then(function(res) {
            return htmlParser(res.body, res.headers, o.feedParserOptions);
        }).then(function(res) {
            return fixData(res, o.url);
        }).then(function(res) {
            return verifyUrl(res);
        }).then(function(res) {
            resolve(res);
        }).catch(function(err) {
            reject(setError(err));
        });
    });
}

module.exports = rssFinder;
