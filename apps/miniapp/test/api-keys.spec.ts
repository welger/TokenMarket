import {
  acknowledgeSecret,
  markSecretCopied,
  revealSecret,
} from '../miniprogram/components/one-time-secret/state';
import {
  copyText,
} from '../miniprogram/utils/clipboard';
import {
  mapApiKey,
  mapApiKeys,
} from '../miniprogram/services/api-keys';
import { createApiKeysPageOptions } from '../miniprogram/pages/api-keys/index';
import {
  requestSuccess,
  seedStorage,
  wxRequestMock,
  wxSetClipboardDataMock,
  wxShowModalMock,
} from './wx.mock';
import { ACCESS_TOKEN_STORAGE_KEY } from '../miniprogram/services/http';

function requestTask(): WechatMiniprogram.RequestTask {
  return {} as WechatMiniprogram.RequestTask;
}

describe('one-time API key secret', () => {
  test('removes plaintext after confirmation', () => {
    const state = acknowledgeSecret({
      acknowledged: false,
      copied: true,
      plaintext: 'sk-gw_secret',
      visible: true,
    });

    expect(state.plaintext).toBeUndefined();
    expect(state.acknowledged).toBe(true);
    expect(state.visible).toBe(false);
  });

  test('tracks reveal and copy without inventing a key value', () => {
    const revealed = revealSecret('sk-gw_once_only');
    const copied = markSecretCopied(revealed);

    expect(revealed.visible).toBe(true);
    expect(copied).toMatchObject({
      copied: true,
      plaintext: 'sk-gw_once_only',
    });
  });
});

describe('api key list mapping', () => {
  test('never carries plaintext into list rows', () => {
    const rows = mapApiKeys([
      {
        createdAt: '2026-06-12T00:00:00.000Z',
        id: 'key_1',
        masked: 'sk-gw_key_1_****ABCD',
        name: '开发环境',
        plaintext: 'sk-gw_secret_should_not_list',
        status: 'ACTIVE',
      },
    ]);

    expect(rows[0]).toEqual({
      canDisable: true,
      createdAtText: '2026-06-12',
      disabledAtText: '',
      id: 'key_1',
      masked: 'sk-gw_key_1_****ABCD',
      name: '开发环境',
      statusText: '启用中',
    });
    expect(JSON.stringify(rows)).not.toContain('sk-gw_secret_should_not_list');
  });

  test('maps disabled keys as non-actionable', () => {
    expect(
      mapApiKey({
        disabledAt: '2026-06-13T00:00:00.000Z',
        id: 'key_2',
        masked: 'sk-gw_key_2_****WXYZ',
        name: '旧 Key',
        status: 'DISABLED',
      }),
    ).toMatchObject({
      canDisable: false,
      disabledAtText: '2026-06-13',
      statusText: '已停用',
    });
  });
});

describe('clipboard helper', () => {
  test('copies only the provided text', async () => {
    wxSetClipboardDataMock.mockImplementation((options) => {
      options.success?.({ errMsg: 'setClipboardData:ok' });
    });

    await copyText('sk-gw_once_only');

    expect(wxSetClipboardDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'sk-gw_once_only',
      }),
    );
  });
});

describe('api key page interactions', () => {
  test('creates a key and stores plaintext only in one-time state', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'test-token');
    const page = createApiKeysPageOptions();
    const setData = jest.fn();
    const context = {
      data: {
        items: [],
        keyName: '开发环境',
      },
      setData,
    } as unknown as WechatMiniprogram.Page.Instance<
      Record<string, unknown>,
      Record<string, unknown>
    >;

    wxRequestMock.mockImplementation((options) => {
      options.success?.(
        requestSuccess({
          createdAt: '2026-06-12T00:00:00.000Z',
          id: 'key_1',
          masked: 'sk-gw_key_1_****ABCD',
          name: '开发环境',
          plaintext: 'sk-gw_once_only',
          status: 'ACTIVE',
        }),
      );
      return requestTask();
    });

    await page.createKey.call(context);

    expect(setData).toHaveBeenCalledWith({
      creating: true,
      errorText: '',
    });
    expect(setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        createdSecret: 'sk-gw_once_only',
        keyName: '',
      }),
    );
    const lastSetData =
      setData.mock.calls[setData.mock.calls.length - 1]?.[0];
    expect(JSON.stringify(lastSetData.items)).not.toContain(
      'sk-gw_once_only',
    );
  });

  test('disables a key only after user confirmation', async () => {
    seedStorage(ACCESS_TOKEN_STORAGE_KEY, 'test-token');
    const page = createApiKeysPageOptions();
    const setData = jest.fn();
    const context = {
      data: {
        items: [
          {
            canDisable: true,
            createdAtText: '2026-06-12',
            disabledAtText: '',
            id: 'key_1',
            masked: 'sk-gw_key_1_****ABCD',
            name: '开发环境',
            statusText: '启用中',
          },
        ],
      },
      setData,
    } as unknown as WechatMiniprogram.Page.Instance<
      Record<string, unknown>,
      Record<string, unknown>
    >;

    wxShowModalMock.mockImplementation((options) => {
      options.success?.({
        cancel: false,
        confirm: true,
        content: '',
        errMsg: 'showModal:ok',
      });
    });
    wxRequestMock.mockImplementation((options) => {
      options.success?.(
        requestSuccess({
          createdAt: '2026-06-12T00:00:00.000Z',
          disabledAt: '2026-06-13T00:00:00.000Z',
          id: 'key_1',
          masked: 'sk-gw_key_1_****ABCD',
          name: '开发环境',
          status: 'DISABLED',
        }),
      );
      return requestTask();
    });

    await page.disableKey.call(
      context,
      {
        currentTarget: { dataset: { id: 'key_1' } },
      } as unknown as WechatMiniprogram.TouchEvent<{ id?: string }>,
    );

    expect(wxShowModalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmText: '停用',
        title: '确认停用 API Key',
      }),
    );
    expect(wxRequestMock.mock.calls[0]?.[0].url).toContain(
      '/me/api-keys/key_1/disable',
    );
    expect(setData).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          canDisable: false,
          disabledAtText: '2026-06-13',
          statusText: '已停用',
        }),
      ],
    });
  });
});
