Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    tone: {
      type: String,
      value: 'neutral',
    },
  },
  methods: {
    handleTap() {
      this.triggerEvent('tap');
    },
  },
});
