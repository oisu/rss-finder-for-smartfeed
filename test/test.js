import test from 'ava';
import fs from 'fs';
import rssFinder from '../';
import {createServer} from './_server';

let s;

test.before('setup', async t => {
    s = await createServer();

    function event(file, contentType) {
        return (req, res) => {
            const data = fs.readFileSync(file);
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.write(data);
            res.end();
        }
    }

    s.on('/html', event('./data/index.html', 'text/html'));
    s.on('/html/', event('./data/index.html', 'text/html'));
    s.on('/rss', event('./data/rss.xml', 'text/xml'));
    s.on('/nofavicon', event('./data/nofavicon.html', 'text/html'));
    s.on('/nourl', event('./data/nourl.xml', 'text/xml'));
    s.on('/sample1', event('./data/fushigi.html', 'text/html'));
    s.on('/sample2', event('./data/asahi-youtube.html', 'text/html'));

    s.on('/favicon.ico', (req, res) => {
        res.statusCode = 500;
        res.end();
    });

    s.on('/fail', event('./data/fail.xml', 'text/xml'));

    await s.listen(s.port);
});

test('check response', async t => {
    const res1 = await rssFinder(`${s.url}/html`);
    const res2 = await rssFinder(`${s.url}/html/`);
    const res3 = await rssFinder(`${s.url}/rss`);
    const res4 = await rssFinder(`${s.url}/nofavicon`);
    const res5 = await rssFinder(`${s.url}/nourl`);
    const res6 = await rssFinder(`${s.url}/sample1`);
    const res7 = await rssFinder(`${s.url}/sample2`);

    function testResponse(res) {
        t.is(res.site.title, 'RSSFinder');
        t.is(res.site.favicon, `${s.url}/favicon.ico`);
        t.is(res.site.url, `${s.url}/html`);
        t.is(res.feedUrls[0].title, 'RSSFinder');
        t.is(res.feedUrls[0].url, `${s.url}/rssfinder.xml`);
    }

    testResponse(res1);
    testResponse(res2);

    t.is(res3.site.title, 'NYT > Home Page');
    t.is(res3.site.favicon, 'http://www.nytimes.com/favicon.ico');
    t.is(res3.site.url, 'http://www.nytimes.com/pages/index.html?partner=rss&emc=rss');
    t.is(res3.feedUrls[0].title, 'NYT > Home Page');
    t.is(res3.feedUrls[0].url, 'http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml');

    t.is(res4.site.title, 'RSSFinder');
    t.is(res4.site.favicon, null);
    t.is(res4.site.url, `${s.url}/nofavicon`);
    t.is(res4.feedUrls[0].title, 'RSSFinder');
    t.is(res4.feedUrls[0].url, `${s.url}/rssfinder.xml`);

    t.is(res5.site.title, 'Index - 24óra');
    t.is(res5.site.favicon, 'http://index.hu/favicon.ico');
    t.is(res5.site.url, 'http://index.hu/24ora/');
    t.is(res5.feedUrls[0].title, 'Index - 24óra');
    t.is(res5.feedUrls[0].url, `${s.url}/nourl`);
 
    t.is(res6.site.title, '不思議.net');
    t.is(res6.site.favicon, 'http://livedoor.blogimg.jp/worldfusigi/imgs/d/a/favicon.ico');
    t.is(res6.feedUrls[0].title, '不思議.net');
    t.is(res6.feedUrls[0].url, 'http://world-fusigi.net/index.rdf');
    t.is(res6.feedUrls.length, 1);

    t.is(res7.site.title, '  朝日新聞社\n - YouTube');
    t.is(res7.site.favicon, 'http://s.ytimg.com/yts/img/favicon_144-vflWmzoXw.png');
    t.is(res7.feedUrls[0].title, '  朝日新聞社\n - YouTube');
    t.is(res7.feedUrls[0].url, 'https://www.youtube.com/feeds/videos.xml?channel_id=UCMKvT0YVLufHMdGLH89J1oA');
    t.is(res7.feedUrls.length, 1);
});

test('fail xml', async t => {
    try {
        await rssFinder(`${s.url}/fail`);
        t.fail('Exception was not thrown');
    } catch (err) {
        t.is(err.message, 'Not a feed');
    }
});

test('not http url is provided', async t => {
    try {
        await rssFinder('');
        t.fail('Exception was not thrown');
    } catch (err) {
        t.is(err.message, 'Not HTTP URL is provided.');
    }
});

test('parameter `opts` must be a string or object', async t => {
    try {
        await rssFinder([]);
        t.fail('Exception was not thrown');
    } catch (err) {
        t.is(err.message, 'Parameter `opts` must be a string or object.');
    }
});

test('catch errors', async t => {
    try {
        await rssFinder({
            url: 'http://url.noexists',
            gotOptions: {
                retries: 0
            }
        });
        t.fail('Exception was not thrown');
    } catch (err) {
        t.regexTest(/getaddrinfo ENOTFOUND/, err.message);
    }
});

test.after('cleanup', async t => {
    await s.close();
});
