'use babel';
/**
 * Created by yugi on 2017/2/9.
 */
import path from 'path';
import fs from 'fs';
import logger from './debug-log';
let VM = 0;

export class BasicInfo {
    constructor(options) {
        throw new Error('It\'s a static class.Never call it\'s constructor.use setInfo and getters instead');
    }

    static setInfo(options) {
        BasicInfo._tempDir = options.tempDir;
        BasicInfo._eventHandler = options.eventHandler;
        BasicInfo._customMappingStrategy = options.customMappingStrategy;
        BasicInfo._enableDefaultMappingStrategy = options.enableDefaultMappingStrategy;
    }

    static get tempDir() {
        return this._tempDir;
    }

    static get eventHandler() {
        return this._eventHandler;
    }

    static get customMappingStrategy() {
        return this._customMappingStrategy;
    }

    static get enableDefaultMappingStrategy() {
        return this._enableDefaultMappingStrategy;
    }

}

export class ScriptMapping {
    constructor() {
        throw 'Use script Mapping as a static class';
    }

    static defaultMappingStrategy(scriptId, url) {
        if (url.startsWith('/') || path.isAbsolute(url)) {
            // try local file path
            const localPath = url.replace('file:///', '/');
            try {
                fs.accessSync(localPath);
                const script = new Script(scriptId, url, localPath);
                script.fetched = true;
                console.log(url, '->', localPath);
                return script;
            } catch (err) {
            }
        }
        // at least we can fetch script and save it to tmp
        const localPath = path.join(BasicInfo.tempDir, url.replace('file:///', '/'));
        const script = new Script(scriptId, url, localPath);
        return script;
        //return null;
    }

    static disableDefaultMappingStrategy() {
        ScriptMapping._defaultMapping = false;
    }

    static enableDefaultMappingStrategy() {
        ScriptMapping._defaultMapping = true;
    }

    static setCustomMappingStrategy(strategy) {
        this._customMappingStrategy = strategy;
    }

    static mapping(scriptId, url) {
        if (ScriptMapping._defaultMapping) {
            let res = ScriptMapping.defaultMappingStrategy(scriptId, url);
            if (res) {
                return res;
            }
        }
        if (ScriptMapping._customMappingStrategy) {
            let res = ScriptMapping._customMappingStrategy(scriptId, url, Script);
            if (res) {
                return res;
            }
        }
        return null;
    }
}

ScriptMapping._defaultMapping = true;

export class Script {
    constructor(scriptId, remotePath, localPath) {
        this._scriptId = scriptId;
        if (!remotePath) {
            VM++;
            this._virtualPath = 'VM' + VM + '.js';
            localPath = path.join(localPath, this._virtualPath);
        } else {
            this._remotePath = remotePath;
            this._virtualPath = remotePath.replace('file:///', '');
        }
        if (process.platform === 'win32' && this._virtualPath.includes(path.posix.sep)) {
            this._virtualPath = this._virtualPath.replace(/\//g, path.win32.sep);
        }
        if (this._virtualPath.split('\\').filter(res => res).length === 1 && this._virtualPath.split('/').filter(res => res).length === 1) {
            this._virtualPath = path.join(path.dirname(this._virtualPath), 'no_domain', path.basename(this._virtualPath));
            localPath = path.join(path.dirname(localPath), 'no_domain', path.basename(localPath));
        }
        this._localPath = localPath;
        this.fetched = false;
    }

    get localPath() {
        return this._localPath;
    }

    get remotePath() {
        return this._remotePath;
    }

    get scriptId() {
        return this._scriptId;
    }

    get virtualPath() {
        return this._virtualPath;
    }
}

export class Location {
    constructor(scriptId, lineNumber, columnNumber) {
        this._scriptId = scriptId;
        this._lineNumber = lineNumber;
        columnNumber && (this._columnNumber = columnNumber);
    }

    get scriptId() {
        return this._scriptId;
    }

    get lineNumber() {
        return this._lineNumber;//chrome 0 based. Atom 1 based
    }

    get columnNumber() {
        return this._columnNumber;
    }
}

export class PendingBreakpoint {
    constructor(script, row, isEnabled, temp) {
        this._script = script;
        this._row = row;
        this._isEnabled = isEnabled === undefined ? true : isEnabled;
        this._temp = temp;
    }

    get script() {
        return this._script;
    }

    set script(script) {
        this._script = script;
    }

    get row() {
        return this._row;
    }

    set row(row) {
        this._row = row;
    }

    get isEnabled() {
        return this._isEnabled;
    }

    set isEnabled(isEnabled) {
        this._isEnabled = isEnabled;
    }

    get temp() {
        return this._temp;
    }

    set temp(temp) {
        this._temp = temp;
    }
}

export class Breakpoint {
    constructor(location, breakpointId) {
        this._location = location;
        this._breakpointId = breakpointId;
    }

    get location() {
        return this._location;
    }

    get breakpointId() {
        return this._breakpointId;
    }

    get temp() {
        return this._temp;
    }

    set temp(temp) {
        this._temp = temp;
    }
}

export class Scope {
    constructor(type, object, name, status) {
        this._type = type;
        this._object = new RemoteObject(object);
        this._name = name;
    }

    get type() {
        return this._type;
    }

    get object() {
        return this._object;
    }

    set object(obj) {
        this._object = obj;
    }

    set objectPromise(promise) {
        this._objectPromise = promise;
    }

    get objectPromise() {
        return this._objectPromise;
    }

    set name(name) {
        this._name = name;
    }

    get name() {
        return this._name;
    }
}

export class CallFrame {
    constructor(callFrameId, functionName, location, scopeChain, thisObject) {
        this._callFrameId = callFrameId;
        this._functionName = functionName;
        this._location = location;
        this._scopeChain = scopeChain;
        this._this = thisObject;
    }

    get callFrameId() {
        return this._callFrameId;
    }

    get functionName() {
        return this._functionName;
    }

    get location() {
        return this._location;
    }

    get scopeChain() {
        return this._scopeChain;
    }

    get this() {
        return this._this;
    }
}

export class Expression {
    constructor(expression) {
        this._expression = expression;
        this._result = new RemoteObject();
        this._result.fullName = expression;
    }

    get expression() {
        return this._expression;
    }

    get result() {
        return this._result;
    }

    set result(result) {
        this._result = new RemoteObject(result);
    }
}

export class FsNode {
    constructor(type, children, name, relateScript) {
        this._type = type;
        this._children = children;
        this._name = name;
        this._relateScript = relateScript;
        this.open = false;
    }

    get type() {
        return this._type;
    }

    get children() {
        return this._children;
    }

    get name() {
        return this._name;
    }

    get relateScript() {
        return this._relateScript;
    }
}

export class ScriptTree {
    constructor() {
        this._scriptList = [];
        this._scriptTree = new FsNode('folder', [], '/', null);
        this._scriptTree.open = true;
    }

    get scriptList() {
        return this._scriptList;
    }

    get scriptTree() {
        return this._scriptTree;
    }

    addScript(script) {
        if (script.remotePath) {
            //this._scriptList.push(script);
            this._scriptList[script.scriptId] = script;
            this._addFsNode(script, this._scriptTree, script.virtualPath.split(path.sep).filter(a => a));
        } else {
            //this._scriptList.push(script);
            this._scriptList[script.scriptId] = script;
            this._addFsNode(script, this._scriptTree, script.virtualPath.split(path.sep).filter(a => a));
            logger.warn('Broken script', script);
        }
    }

    _addFsNode(script, fsNode, scriptPath) {
        if (scriptPath.length === 1) {
            let currentFsNode = new FsNode('file', [], scriptPath[0], script);
            fsNode.children.push(currentFsNode);
        } else {
            let currentName = scriptPath.shift();
            let currentFsNode = fsNode.children.filter(fsNode => fsNode.name === currentName);
            if (currentFsNode && currentFsNode[0]) {
                this._addFsNode(script, currentFsNode[0], scriptPath);
            } else {
                currentFsNode = new FsNode('folder', [], currentName, null);
                this._addFsNode(script, currentFsNode, scriptPath);
                fsNode.children.push(currentFsNode);
            }
        }
    }
}

export class RemoteObject {
    constructor(options) {
        options = options || {};
        this._type = options.type;
        this._subtype = options.subtype;
        this._className = options.className;
        this._value = options.value;
        this._description = options.description;
        this._objectId = options.objectId;
        this._preview = options.preview;
        this._name = options.name;
        this._children = options.children;
        this._fullName = options.fullName;
        this._preview = options.preview;
        if (!options.objectId) {
            logger.info('noId', options);
        }
    }

    get type() {
        return this._type;
    }

    set type(type) {
        this._type = type;
    }

    get subtype() {
        return this._subtype;
    }

    set subtype(subtype) {
        this._subtype = subtype;
    }

    get className() {
        return this._className;
    }

    set className(className) {
        this._className = className;
    }

    get value() {
        return this._value;
    }

    set value(value) {
        this._value = value;
    }

    get description() {
        return this._description;
    }

    set description(description) {
        this._description = description;
    }

    get objectId() {
        return this._objectId;
    }

    set objectId(objectId) {
        this._objectId = objectId;
    }

    get preview() {
        return this._preview;
    }

    set preview(preview) {
        this._preview = preview;
    }

    get name() {
        return this._name;
    }

    set name(name) {
        this._name = name;
    }

    get children() {
        return this._children;
    }

    set children(children) {
        this._children = children;
    }

    get fullName() {
        return this._fullName;
    }

    set fullName(fullName) {
        this._fullName = fullName;
    }

}
