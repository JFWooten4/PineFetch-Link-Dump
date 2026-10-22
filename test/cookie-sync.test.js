'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createPopupElements, loadPopupTestApi } = require('../test-utils/popup.js');
const synthetic = {domain:'.youtube.com',path:'/',name:'synthetic',value:'synthetic',secure:true,httpOnly:true,hostOnly:false};
async function setup({granted=true,endpoint='http://127.0.0.1:2255',status=200}={}) {
    const calls=[];
    const {api}=await loadPopupTestApi({
        chrome:{permissions:{request:async request=>{calls.push(['permission',request]);return granted;}},cookies:{getAll:async filter=>{calls.push(['cookies',filter]);return [synthetic,{...synthetic,domain:'evil.test'},{...synthetic,partitionKey:{topLevelSite:'https://example.test'}}];}}},
        fetch:async(url,options)=>{calls.push(['fetch',url,options]);return {ok:status===200,status,json:async()=>({ok:true})};},
    });
    const elements=createPopupElements({endpoint,secret:'synthetic-pairing-secret'});
    api.setElements(elements);
    return {api,elements,calls};
}
test('sync requests permission only on click and sends only YouTube cookies over loopback without redirects',async()=>{
    const {api,elements,calls}=await setup();
    assert.equal(calls.length,0);
    await api.handleCookieSyncClick();
    assert.deepEqual(calls.map(call=>call[0]),['permission','cookies','fetch']);
    const [,url,options]=calls[2];
    assert.equal(url,'http://127.0.0.1:2255/syncYoutubeCookies/');
    assert.equal(options.redirect,'error');
    assert.equal(options.credentials,'omit');
    const body=JSON.parse(options.body);
    assert.equal(body.secret,'synthetic-pairing-secret');
    assert.equal(body.cookies.length,1);
    assert.equal(body.cookies[0].domain,'.youtube.com');
    assert.match(elements.cookieSyncStatus.textContent,/synced to PineFetch/);
    assert.equal(elements.syncCookiesButton.disabled,false);
});
test('denial does not read or transmit cookies',async()=>{
    const {api,elements,calls}=await setup({granted:false});
    await api.handleCookieSyncClick();
    assert.deepEqual(calls.map(call=>call[0]),['permission']);
    assert.match(elements.cookieSyncStatus.textContent,/Nothing was sent/);
});
test('external endpoints are rejected before permission or cookie access',async()=>{
    const {api,calls}=await setup({endpoint:'https://example.test'});
    await api.handleCookieSyncClick();
    assert.equal(calls.length,0);
});
test('unauthorized receiver reports pairing error without displaying values',async()=>{
    const {api,elements}=await setup({status:401});
    await api.handleCookieSyncClick();
    assert.match(elements.cookieSyncStatus.textContent,/Connection rejected/);
    assert.doesNotMatch(elements.cookieSyncStatus.textContent,/synthetic/);
});
