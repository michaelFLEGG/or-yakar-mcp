class VoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const nch = (options.processorOptions && options.processorOptions.nch) || 1;
    this.nch = nch;
    this.dsp = new VoiceDSP(sampleRate, nch, Math.round(sampleRate * 0.04));
    this.zero = new Float32Array(128);
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.reset) this.dsp.reset();
      if (m.params) this.dsp.setParams(m.params);
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const n = out[0].length;
    const ins = [], outs = [];
    for (let c = 0; c < this.nch; c++) {
      ins.push(inp[c] || this.zero);
      outs.push(out[c] || new Float32Array(n));
    }
    this.dsp.processBlock(ins, outs, n);
    return true;
  }
}
registerProcessor('voice', VoiceProcessor);
