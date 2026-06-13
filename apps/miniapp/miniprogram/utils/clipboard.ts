export function copyText(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      fail: () => reject(new Error('复制失败，请手动保存')),
      success: () => resolve(),
    });
  });
}
