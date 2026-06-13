import { copyText } from '../../utils/clipboard';

Component({
  data: {
    copied: false,
  },
  observers: {
    plaintext(value: string) {
      if (value) {
        this.setData({ copied: false });
      }
    },
  },
  properties: {
    plaintext: {
      type: String,
      value: '',
    },
  },
  methods: {
    async acknowledge() {
      this.triggerEvent('acknowledge');
    },
    async copySecret() {
      const plaintext = this.properties.plaintext.trim();
      if (!plaintext) {
        return;
      }

      await copyText(plaintext);
      this.setData({ copied: true });
    },
  },
});
