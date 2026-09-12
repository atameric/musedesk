/**
 * IPC channel names shared by main and preload. Single source of truth:
 * both sides import these consts, so a channel rename can never strand one
 * side on a stale string.
 */
export const IPC = {
  status: 'musedesk:status',
  sessionStart: 'musedesk:session/start',
  turnSend: 'musedesk:turn/send',
  turnInterrupt: 'musedesk:turn/interrupt',
  viewPage: 'musedesk:view/page',
  sessionList: 'musedesk:session/list',
  sessionResume: 'musedesk:session/resume',
  sessionRead: 'musedesk:session/read',
  modelList: 'musedesk:model/list',
  modelSet: 'musedesk:model/set',
  approvalModeSet: 'musedesk:approvalmode/set',
  approvalDecide: 'musedesk:approval/decide',
  approvalPending: 'musedesk:approval/pending',
  userInputAnswer: 'musedesk:userinput/answer',
  userInputCancel: 'musedesk:userinput/cancel',
  imagePick: 'musedesk:image/pick',
  hostSetFullAccess: 'musedesk:host/setFullAccess',
  workspacePick: 'musedesk:workspace/pick',
  workspaceDefault: 'musedesk:workspace/default',
  chatEvent: 'musedesk:chat-event',
} as const;
