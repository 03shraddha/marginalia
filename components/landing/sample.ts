/** The sample reading: Microsoft AI's note on pre-training. The landing's demo and its example link both use it. */
export const SAMPLE_URL = "https://microsoft.ai/news/frontier-pre-training-at-microsoft-ai/";
export const SAMPLE_HOST = "microsoft.ai/news/frontier-pre-training-at-microsoft-ai";

export const SAMPLE = {
  title: "Frontier Pre-training at Microsoft AI",
  kicker: "Microsoft AI · Lab Notes · October 15, 2026",
  paras: [
    "In June, we announced MAI-Thinking-1, a general-purpose foundation model post-trained on top of MAI-Base-1 with strong reasoning performance. We’ve recently completed pre-training our new state-of-the-art model, MAI-Base-2, an MoE foundation model with 80 billion active and 2.8 trillion total parameters.",
    "MAI-Base-2 outperforms every open-weight model we tested on our held-out evaluations. It is 4-12x more pre-training FLOPs-efficient than the strongest open base model, DeepSeek-V4-Pro-Base (see Figure 3 below), and we have put that saving into training a larger model.",
    "Owning our model pipeline end-to-end allows Microsoft to make a distinctive offering to our customers. Microsoft has strong data provenance over training tokens that go into our model. Our pre-training is built on organic data which does not involve distillation from other models.",
  ],
};

/** The paragraph and phrase that start out marked, with an answer written by hand so the page has one before anyone asks. */
export const PRESET = { n: 2, phrase: "4-12x more pre-training FLOPs-efficient than the strongest open base model" };

export const EXAMPLE = `==It reaches the same quality with far less compute.== Microsoft says MAI-Base-2 needs 4 to 12 times fewer pre-training FLOPs than DeepSeek-V4-Pro-Base [¶2]. It spent the saving on a bigger model, 2.8 trillion parameters in total [¶1]. The comparison comes from Microsoft's own held-out tests, so read it as their claim [¶2].`;
