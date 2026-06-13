type RequestOptions = WechatMiniprogram.RequestOption;
type RequestData =
  WechatMiniprogram.RequestSuccessCallbackResult['data'];

const storage = new Map<string, unknown>();

const emptyRequestException: WechatMiniprogram.RequestException = {
  reasons: [],
  retryCount: 0,
};

const emptyRequestProfile: WechatMiniprogram.RequestProfile = {
  SSLconnectionEnd: 0,
  SSLconnectionStart: 0,
  connectEnd: 0,
  connectStart: 0,
  domainLookUpEnd: 0,
  domainLookUpStart: 0,
  downstreamThroughputKbpsEstimate: 0,
  estimate_nettype: 0,
  fetchStart: 0,
  httpDNSDomainLookUpEnd: 0,
  httpDNSDomainLookUpStart: 0,
  httpRttEstimate: 0,
  invokeStart: 0,
  peerIP: '',
  port: 0,
  protocol: 'unknown',
  queueEnd: 0,
  queueStart: 0,
  receivedBytedCount: 0,
  redirectEnd: 0,
  redirectStart: 0,
  requestEnd: 0,
  requestStart: 0,
  responseEnd: 0,
  responseStart: 0,
  rtt: 0,
  sendBytesCount: 0,
  socketReused: false,
  throughputKbps: 0,
  transportRttEstimate: 0,
  usingHighPerformanceMode: false,
};

export const wxRequestMock = jest.fn<
  WechatMiniprogram.RequestTask,
  [RequestOptions]
>();

export const wxLoginMock = jest.fn<
  void,
  [WechatMiniprogram.LoginOption]
>();

export const wxGetAccountInfoSyncMock = jest.fn<
  WechatMiniprogram.AccountInfo,
  []
>(() => createAccountInfo('develop'));

export const wxGetStorageSyncMock = jest.fn((key: string): unknown =>
  storage.get(key),
);

export const wxSetStorageSyncMock = jest.fn(
  (key: string, value: unknown): void => {
    storage.set(key, value);
  },
);

export const wxRemoveStorageSyncMock = jest.fn((key: string): void => {
  storage.delete(key);
});

export const wxRequestPaymentMock = jest.fn<
  void,
  [WechatMiniprogram.RequestPaymentOption]
>();

export const wxSetClipboardDataMock = jest.fn<
  void,
  [WechatMiniprogram.SetClipboardDataOption]
>();

export const wxShowModalMock = jest.fn<
  void,
  [WechatMiniprogram.ShowModalOption]
>();

export const wxSwitchTabMock = jest.fn<
  void,
  [WechatMiniprogram.SwitchTabOption]
>();

export const wxNavigateToMock = jest.fn<
  void,
  [WechatMiniprogram.NavigateToOption]
>();

export function installWxMock(): void {
  (globalThis as unknown as { wx: WechatMiniprogram.Wx }).wx = {
    getAccountInfoSync: wxGetAccountInfoSyncMock,
    getStorageSync: wxGetStorageSyncMock,
    login: wxLoginMock,
    removeStorageSync: wxRemoveStorageSyncMock,
    request: wxRequestMock,
    requestPayment: wxRequestPaymentMock,
    setClipboardData: wxSetClipboardDataMock,
    setStorageSync: wxSetStorageSyncMock,
    showModal: wxShowModalMock,
    navigateTo: wxNavigateToMock,
    switchTab: wxSwitchTabMock,
  } as unknown as WechatMiniprogram.Wx;
}

export function resetWxMock(): void {
  storage.clear();
  wxRequestMock.mockReset();
  wxLoginMock.mockReset();
  wxGetAccountInfoSyncMock.mockReset();
  wxGetAccountInfoSyncMock.mockImplementation(() =>
    createAccountInfo('develop'),
  );
  wxGetStorageSyncMock.mockClear();
  wxRemoveStorageSyncMock.mockClear();
  wxSetStorageSyncMock.mockClear();
  wxRequestPaymentMock.mockReset();
  wxSetClipboardDataMock.mockReset();
  wxShowModalMock.mockReset();
  wxNavigateToMock.mockReset();
  wxSwitchTabMock.mockReset();
}

function createAccountInfo(
  envVersion: WechatMiniprogram.MiniProgram['envVersion'],
): WechatMiniprogram.AccountInfo {
  return {
    miniProgram: {
      appId: 'test-miniapp',
      envVersion,
      version: '0.0.0',
    },
  } as WechatMiniprogram.AccountInfo;
}

export function setAccountEnvVersion(
  envVersion: WechatMiniprogram.MiniProgram['envVersion'],
): void {
  wxGetAccountInfoSyncMock.mockReturnValue(createAccountInfo(envVersion));
}

export function seedStorage(key: string, value: unknown): void {
  storage.set(key, value);
}

export function requestSuccess(
  data: RequestData,
  statusCode = 200,
  header: WechatMiniprogram.IAnyObject = {},
): WechatMiniprogram.RequestSuccessCallbackResult {
  return {
    cookies: [],
    data,
    errMsg: 'request:ok',
    exception: emptyRequestException,
    header,
    profile: emptyRequestProfile,
    statusCode,
    useHttpDNS: false,
  };
}

export function requestFailure(
  errMsg: string,
  errno = -1,
): WechatMiniprogram.RequestFailCallbackErr {
  return {
    errno,
    errMsg,
    exception: emptyRequestException,
    useHttpDNS: false,
  };
}
