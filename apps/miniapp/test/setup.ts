import { API_ALLOWED_HOSTS } from '../miniprogram/config/api';
import { installWxMock, resetWxMock } from './wx.mock';

installWxMock();

beforeEach(() => {
  API_ALLOWED_HOSTS.develop.splice(
    0,
    API_ALLOWED_HOSTS.develop.length,
    'localhost',
    '127.0.0.1',
  );
  API_ALLOWED_HOSTS.trial.splice(0);
  API_ALLOWED_HOSTS.release.splice(0);
  resetWxMock();
});
