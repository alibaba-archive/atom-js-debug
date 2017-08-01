'use babel';
import EventCode from './eventcode';
import MsgMgr from '../msg-mgr';
const logger = require('./debug-log');

class MessageHandler {
    constructor(cb) {
        MsgMgr.on(EventCode.T2D_BREAK_ADD, cb.onAddBreakpoint);
        MsgMgr.on(EventCode.T2D_BREAK_DEL, cb.onRemoveBreakpoint);
        MsgMgr.on(EventCode.T2D_BREAK_SYNC, cb.onResetBreakpoint);
    }

    sendDebugStart() {
        logger.info('EventCode.D2T_DEBUG_BGN');
        MsgMgr.send(EventCode.D2T_DEBUG_BGN);
    }

    sendDebugResume() {
        logger.info('EventCode.D2T_DEBUG_RESUME');
        MsgMgr.send(EventCode.D2T_DEBUG_RESUME);
    }

    sendDebugEnd() {
        logger.info('EventCode.D2T_DEBUG_END');
        MsgMgr.send(EventCode.D2T_DEBUG_END);
    }

    sendBreakpointRemoved(options) {
        logger.info('EventCode.D2T_BREAK_DEL', options);
        MsgMgr.send(EventCode.D2T_BREAK_DEL, options);
    }

    sendBreakpointAdded(options) {
        logger.info('EventCode.D2T_BREAK_ADD', options);
        MsgMgr.send(EventCode.D2T_BREAK_ADD, options);
    }

    sendHighlightLine(options) {
        logger.info('EventCode.D2T_BREAK_INDEX', options);
        MsgMgr.send(EventCode.D2T_BREAK_INDEX, options);
    }

    sendBreakpointEnable(bp) {
        logger.info('EventCode.D2T_BREAK_ENABLE', bp);
        MsgMgr.send(EventCode.D2T_BREAK_ENABLE, bp);
    }

    sendBreakpointDisable(bp) {
        logger.info('EventCode.D2T_BREAK_DISABLE', bp);
        MsgMgr.send(EventCode.D2T_BREAK_DISABLE, bp);
    }
}

module.exports = MessageHandler;
