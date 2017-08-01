'use babel';
/**
 * Created by yugi on 2017/2/7.
 */
import ChromeConnection from './chrome-connection';
import {ScriptTree, RemoteObject} from './debug-interface';
import EventEmitter from 'events';
import logger from './debug-log';

/**
 * provide a wrapper for chrome debug protocol client implements
 * @class DebugAdapter
 * @extends EventEmitter
 */
export default class DebugAdapter extends EventEmitter {

    /**
     * setup initial status a create a chromeConnection
     * @constructor
     * @param {String} wsUri a websocket uri for chrome debug protocol server
     * @param {BasicInfo} basicInfo a object include deviceId, domain, page and srcPath
     * @param {Function} done a Function to be call after we can send debug request
     */
    constructor(wsUri, done) {
        //this.scriptList = [];
        super();
        let _this = this;
        // Script provide a tree and a list to all parsed script
        this.scriptTree = new ScriptTree();
        // we preserved current callframes and watched expressions by array
        this.callFrames = [];
        this.watchList = [];
        // make a connection
        _this.timeout = true;
        this.chromeConnection = new ChromeConnection(wsUri, () => {
            // after connection open.we send some basic request to bring up debug
            _this.timeout = false;
            _this.run(done);
        });
        setTimeout(() => {
            if (this.timeout && this.chromeConnection.ws.listeners('open') > 0) {
                logger.error('Fail to create websocket connection.');
                this.clearWatch();
                this.emit('end', 'Fail to create websocket connection.');
            }
        }, 20000);
        // while we make the connection.we can setup all handler for event emit by chromeConnection
        this.prepareEventHandler();
    }

    evaluateWatchList() {
        let _this = this;
        if (!this.currentCallFrame) {
            return Promise.resolve();
        }
        return Promise.all(_this.watchList.map(expression =>
            _this.chromeConnection.send({"method": "Debugger.evaluateOnCallFrame", "params": {"callFrameId": _this.currentCallFrame.callFrameId, expression: expression.expression}})
            .then(res => {
                expression.result = res;
                expression.result.fullName = expression.expression;
            })
        ));
    }

    /**
     * Prepare handler for chromeConnection event
     */
    prepareEventHandler() {
        let _this = this;
        this.chromeConnection.on('Script:add', script => {
            // when we parsed a new script,add it to scriptTree and pop the message
            this.scriptTree.addScript(script);
            this.emit('scriptUpdate', script);
        });
        this.chromeConnection.on('paused', async (callFrames, data) => {
            // By default we do all evaluateOnCallFrame in currentCallFrame
            _this.currentCallFrame = callFrames[0];
            // we evaluate all watched expressions and update their result.Here we do it in `Sync` way.
            // XXX: this may cause random behaviour if something like a=a+1 watched
            await _this.evaluateWatchList();
            _this.emit('paused', callFrames, data);
        });
        this.chromeConnection.on('resumed', () => {
            // when we resumed, we clean the watch result
            this.clearWatch();
            this.emit('resumed');
        });
        this.chromeConnection.on('end', code => {
            // when we end, we clean the watch result
            this.clearWatch();
            this.emit('end', code);
        });
        this.chromeConnection.on('console', message => {
            this.emit('console', message);
        });
    }

    /**
     * get real ES6 Symbol info
     * @param {String} fullName
     */
    symbolResolver(fullName) {
        // For ES6 Symbol.we can use toString to find its string representation. like Symbol('hi')
        return this.evaluateOnCallFrame(`${fullName}.toString()`, this.currentCallFrame).then(res => {
            res.type = "symbol";
            // no sure symbol.toString() is a good fullName.
            res.fullName = fullName;
            return Promise.resolve(res);
        });
    }

    /**
     * get real ES6 Set info
     * @param {String} fullName
     */
    async setResolver(fullName) {
            // For ES6 Set. we can get its size, __proto__, and [[Entries]](By [...setName]).
        let size = await this.evaluateOnCallFrame(`${fullName}['size']`, this.currentCallFrame);
        var set = new RemoteObject({});
        set.children = [];
        if (size && size.value && size.value !== 0) {
            // if it is empty, [...setName] will throw.
            let res = await this.evaluateOnCallFrame(`[...${fullName}]`, this.currentCallFrame);
            res.name = '[[Entries]]';
            res = new RemoteObject(res);
            set.children.push(res);
        }
        let proto = await this.evaluateOnCallFrame(`${fullName}['__proto__']`, this.currentCallFrame);
        set.fullName = fullName;
        set.type = 'set';
        set.description = `Set {${size.value === undefined ? 0 : size.value}}`;
        set.objectId = fullName;
        proto.name = '__proto__';
        size.name = 'size';
        size = new RemoteObject(size);
        proto = new RemoteObject(proto);
        set.children.push(size);
        set.children.push(proto);
        return set;
    }

    /**
     * get real ES6 Map info
     */
    async mapResolver(fullName) {
        // For ES6 Map. we can get its size, __proto__, and [[Entries]](By [...mapName]).
        let size = await this.evaluateOnCallFrame(`${fullName}['size']`, this.currentCallFrame);
        var map = new RemoteObject({});
        map.children = [];
        if (size && size.value && size.value !== 0) {
            // if it is empty, [...mapName] will throw.
            let res = await this.evaluateOnCallFrame(`[...${fullName}]`, this.currentCallFrame);
            res.name = '[[Entries]]';
            res = new RemoteObject(res);
            map.children.push(res);
        }
        let proto = await this.evaluateOnCallFrame(`${fullName}['__proto__']`, this.currentCallFrame);
        map.fullName = fullName;
        map.type = 'map';
        map.description = `Map {${size.value === undefined ? 0 : size.value}}`;
        map.objectId = fullName;
        proto.name = '__proto__';
        size.name = 'size';
        size = new RemoteObject(size);
        proto = new RemoteObject(proto);
        map.children.push(size);
        map.children.push(proto);
        return map;
    }

    /**
     * get all properties of remoteObject
     * @param {RemoteObject} remoteObject
     * @param {Object} [options]
     * @param {Boolean} [options.isPreview] fetch preview of remoteObject if true
     */
    async loopProperties(remoteObject, options) {
        // we only fetch object properties
        if (!['object', 'set', 'map', 'function'].includes(remoteObject.type)) {
            return Promise.resolve(remoteObject);
        }
        logger.info('start loop properties', remoteObject.fullName);
        let propertiesList = await this.getProperties(remoteObject.objectId, remoteObject.fullName);
        logger.info('done get properties', remoteObject.fullName);
        if (!propertiesList || !propertiesList.length) {
            return Promise.resolve(remoteObject);
        }
        var res;
        let newPropertiesList = [];
        // if its a preview.we only need to fetch first 3 properties.we ignore inner properties when fetch preview.
        // as for __proto__, we never to preview, but fetch whole object.as it may contains some getter
        if (remoteObject.name !== '__proto__' && options && options.isPreview && propertiesList.filter(res => !res.name.startsWith('__')).length > 3) {
            // partial Preview indicate this object not fetch all properties.just preview.
            remoteObject.partialPreview = true;
            propertiesList = propertiesList.filter(res => !res.name.startsWith('__')).sort((a,b) => {return a.name && a.name.localeCompare && b.name ? a.name.localeCompare(b.name) : 0}).slice(0,3);
        } else {
            remoteObject.partialPreview = false;
        }
        logger.info('start dealing propertiesList', remoteObject.fullName);
        await Promise.all(propertiesList.map(async property => {
            if (property.get && property.name !== '__proto__') {
                property.value = {};
                property.value.type = 'getter';
                property.value.objectId = property.get.objectId;
                property.value.description = '(...)';
            } else if (!property.value) {
                logger.info('Fail to fetch property', property);
                return;
            }
            property.value.name = property.name;
            property.value.fullName = remoteObject.fullName ? `${remoteObject.fullName}['${property.value.name}']` : property.value.name;
            // FIX low version node + node-inspector not support display set/map/symbol/getter properties.
            // switch (property.value.type) {
            //     case 'set':
            //         res = await this.setResolver(property.value.fullName);
            //         //res = yield _this.evaluateOnCallFrame(remoteObject.fullName ? '[...' + remoteObject.fullName + '.' + property.value.name + "]" : "[..." + property.value.name + "]", _this.currentCallFrame);
            //         res.name = property.name;
            //         property.value = new RemoteObject(res);
            //         break;
            //     case 'map':
            //         res = await this.mapResolver(property.value.fullName);
            //         //res = yield _this.evaluateOnCallFrame(remoteObject.fullName ? '' + remoteObject.fullName + '.' + property.value.name : property.value.name, _this.currentCallFrame);
            //         res.name = property.name;
            //         property.value = new RemoteObject(res);
            //         break;
            //     case 'symbol':
            //         res = await this.symbolResolver(property.value.fullName);
            //         //res = yield _this.evaluateOnCallFrame(remoteObject.fullName ? '' + remoteObject.fullName + '.' + property.value.name + '.toString()' : property.value.name + '.toString()', _this.currentCallFrame);
            //         res.name = property.name;
            //         property.value = new RemoteObject(res);
            //         break;
            //     case 'undefined':
            //         // we guess it's a getter;
            //         property.value.type = 'getter';
            //         property.value = new RemoteObject(property.value);
            //         logger.info('maybe getter', property.value.name, property.value);
            //         break;
            //     default:
            // }
            //property.value.preview = yield _this.getPreview(property.value);
            newPropertiesList.push(property.value);
        }));
        remoteObject.children = newPropertiesList;
        logger.info('loopProperties done', remoteObject, remoteObject.fullName);
        return remoteObject;
    }


    clearWatch() {
        this.watchList.forEach(expression => expression.result = {});
    }

    async run(done) {
        await this.chromeConnection.send({"method": "Console.enable"});
        await this.chromeConnection.send({"method": "Debugger.enable"});
        await this.chromeConnection.send({"method": "Debugger.setPauseOnExceptions", "params": {"state": "all"}});
        await this.chromeConnection.send({"method": "Page.getResourceTree"});
        await this.chromeConnection.send({"method": "Debugger.setAsyncCallStackDepth","params":{"maxDepth":0}});
        await this.chromeConnection.send({"method": "Runtime.enable"});
        await this.chromeConnection.send({"method": "Inspector.enable"});
        await this.chromeConnection.send({"method": "Debugger.setSkipAllPauses","params":{"skip":false}});
        done();
    }

    resume() {
        return this.chromeConnection.send({"method": "Debugger.resume"});
    }

    pause() {
        return this.chromeConnection.send({"method": "Debugger.pause"});
    }

    setBreakpoint(script, line) {
        return this.chromeConnection.send({"method": "Debugger.setBreakpointByUrl", "params": {url:script.remotePath, lineNumber:line}});
    }

    removeBreakpoint(breakpoint) {
        return this.chromeConnection.send({"method": "Debugger.removeBreakpoint", "params": {"breakpointId": breakpoint.breakpointId}});
    }

    addWatchList(expression) {
        this.watchList.push(expression);
        logger.info('add watch: ', this.watchList);
    }

    removeWatchList(expression) {
        this.watchList = this.watchList.filter(exp => exp !== expression);
    }

    evaluateOnCallFrame(expression, callFrame) {
        if (!callFrame) {
            callFrame = this.currentCallFrame;
        }
        if (expression === undefined || expression === null) {
            return Promise.resolve(new RemoteObject());
        }
        return this.chromeConnection.send({"method": "Debugger.evaluateOnCallFrame", "params": {"callFrameId": callFrame.callFrameId, "expression": expression}}).then(res => {
            res && (res.fullName = expression);
            return Promise.resolve(res);
        });
    }

    stepInto() {
        return this.chromeConnection.send({"method": "Debugger.stepInto"});
    }

    stepOver() {
        return this.chromeConnection.send({"method": "Debugger.stepOver"});
    }

    stepOut() {
        return this.chromeConnection.send({"method": "Debugger.stepOut"});
    }

    async getProperties(objectId, fullName) {
        if (objectId === "ERROR") {
            return Promise.resolve([]);
        }
        let res = await this.chromeConnection.send({"method": "Runtime.getProperties", "params": {"objectId": objectId, "generatePreview": false, "ownProperties": true, "accessorPropertiesOnly": false}});
        let res2 = await this.chromeConnection.send({"method": "Runtime.getProperties", "params": {"objectId": objectId, "generatePreview": false, "ownProperties": false, "accessorPropertiesOnly": true}});
        if (res2 && res2.length > 0) {
            logger.warn('Find accessorProperties', res2);
            return res.concat(res2);
        }
        return res;
    }

    setPauseOnExceptions(mode) {
        return this.chromeConnection.send({"method": "Debugger.setPauseOnExceptions", "params": {"state": mode}});
    }

    getPossibleBreakpoints(location) {
        return this.chromeConnection.send({"method": "Debugger.getPossibleBreakpoints", "params": {start: location}});
    }

    getScriptSource(scriptId) {
        return this.chromeConnection.send({'method': 'Debugger.getScriptSource', 'params': {'scriptId': scriptId}});
    }

    setScriptSource(scriptId, scriptSource) {
        return this.chromeConnection.send({"method": "Debugger.setScriptSource", "params": {"scriptId": scriptId, "scriptSource": scriptSource, "dryRun": false}});
    }

    close() {
        this.chromeConnection.close();
    }
}
