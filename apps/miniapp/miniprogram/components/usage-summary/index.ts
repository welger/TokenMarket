Component({
  properties: {
    emptyText: {
      type: String,
      value: '',
    },
    errorText: {
      type: String,
      value: '',
    },
    hasPlans: {
      type: Boolean,
      value: false,
    },
    usage: {
      type: Object,
      value: {},
    },
  },
});
