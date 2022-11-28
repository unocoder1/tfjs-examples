/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tf from '@tensorflow/tfjs';
import {TextData} from './data';

/**
 * Generate text using a next-char-prediction model.
 *
 * @param {tf.Model} model The model object to be used for the text generation,
 *   assumed to have input shape `[null, sampleLen, charSetSize]` and output
 *   shape `[null, charSetSize]`.
 * @param {number[]} sentenceIndices The character indices in the seed sentence.
 * @param {string} initialLetters First letters or every word in the text to be generated.
 * @param {number} temperature Temperature value. Must be a number >= 0 and
 *   <= 1.
 * @param {(char: string) => Promise<void>} onTextGenerationChar An optinoal
 *   callback to be invoked each time a character is generated.
 * @returns {string} The generated sentence.
 */
export async function generateText(
    model, textData, sentenceIndices, initialLetters, temperature,
    onTextGenerationChar) {
  const sampleLen = model.inputs[0].shape[1];
  const charSetSize = model.inputs[0].shape[2];

  // Avoid overwriting the original input.
  sentenceIndices = sentenceIndices.slice();

  let generated = '';
  for (let i = 0; i < initialLetters.length; i++) {
    if (i > 0) generated += " ";
    generated += initialLetters[i];
    sentenceIndices = sentenceIndices.slice(1);
    sentenceIndices.push(textData.textToIndices(initialLetters[i])[0]);

    let winnerChar = undefined;
    do {
      // Encode the current input sequence as a one-hot Tensor.
      const inputBuffer = new tf.TensorBuffer([1, sampleLen, charSetSize]);

      // Make the one-hot encoding of the seeding sentence.
      for (let j = 0; j < sampleLen; ++j) {
        inputBuffer.set(1, 0, j, sentenceIndices[j]);
      }
      const input = inputBuffer.toTensor();

      // Call model.predict() to get the probability values of the next
      // character.
      const output = model.predict(input);

      // Sample randomly based on the probability values.
      const winnerIndex = sample(tf.squeeze(output), temperature);
      winnerChar = textData.getFromCharSet(winnerIndex);
      if (onTextGenerationChar != null) {
        await onTextGenerationChar(winnerChar);
      }

      generated += winnerChar;
      sentenceIndices = sentenceIndices.slice(1);
      sentenceIndices.push(winnerIndex);

        // Memory cleanups.
        input.dispose();
        output.dispose();
    } while (/\s/.test(winnerChar) === false);
  }
  return generated;
}

/**
 * Draw a sample based on probabilities.
 *
 * @param {tf.Tensor} probs Predicted probability scores, as a 1D `tf.Tensor` of
 *   shape `[charSetSize]`.
 * @param {tf.Tensor} temperature Temperature (i.e., a measure of randomness
 *   or diversity) to use during sampling. Number be a number > 0, as a Scalar
 *   `tf.Tensor`.
 * @returns {number} The 0-based index for the randomly-drawn sample, in the
 *   range of `[0, charSetSize - 1]`.
 */
export function sample(probs, temperature) {
  return tf.tidy(() => {
    const logits = tf.div(tf.log(probs), Math.max(temperature, 1e-6));
    const isNormalized = false;
    // `logits` is for a multinomial distribution, scaled by the temperature.
    // We randomly draw a sample from the distribution.
    return tf.multinomial(logits, 1, null, isNormalized).dataSync()[0];
  });
}
