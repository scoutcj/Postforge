import { Anthropic } from '@anthropic-ai/sdk';

// Use vision-capable model - Claude 3 Opus has excellent vision capabilities
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5';
const anthropic = process.env.CLAUDE_API_KEY
  ? new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })
  : null;

/**
 * Fetch an image from HTTP URL and convert to base64
 * @param {string} url - HTTP(S) URL of the image
 * @returns {Promise<{mediaType: string, base64Data: string}>}
 */
async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Data = buffer.toString('base64');

  // Get content type from response headers
  const contentType = response.headers.get('content-type') || 'image/png';

  return {
    mediaType: contentType,
    base64Data
  };
}

/**
 * Convert image URL to base64 (handles both data URLs and HTTP URLs)
 * @param {string} imageUrl - Either data URL or HTTP URL
 * @returns {Promise<{mediaType: string, base64Data: string}>}
 */
async function imageUrlToBase64(imageUrl) {
  // Check if it's a data URL (base64)
  const dataUrlMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      mediaType: dataUrlMatch[1],
      base64Data: dataUrlMatch[2]
    };
  }

  // Check if it's an HTTP URL
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return await fetchImageAsBase64(imageUrl);
  }

  throw new Error(`Invalid image URL format: ${imageUrl}`);
}

// Batching constants
const MAX_BATCH_SIZE_MB = 30;
const ESTIMATED_IMAGE_SIZE_KB = 500;

/**
 * Generate Instagram captions by having Claude review images and email content
 * Claude will select the best 3-5 image+caption combinations from all emails
 */
export async function generateInstagramCaptions({ emails, date }) {
  if (!anthropic) {
    throw new Error('Claude client not configured');
  }

  if (!emails || emails.length === 0) {
    return [];
  }

  console.log(`[AI] Using Claude model: ${CLAUDE_MODEL}`);

  // Flatten all images with their email context
  const allImages = [];
  emails.forEach((email) => {
    email.imageUrls.forEach((imageUrl) => {
      allImages.push({
        imageUrl,
        emailId: email.id,
        subject: email.subject,
        sender: email.sender,
        textContent: email.textContent
      });
    });
  });

  console.log(`[AI] Total images to process: ${allImages.length}`);

  // Batch images by size (max 30MB per batch)
  const batches = [];
  let currentBatch = [];
  let currentBatchSizeKB = 0;
  const maxBatchSizeKB = MAX_BATCH_SIZE_MB * 1024;

  for (const image of allImages) {
    if (currentBatchSizeKB + ESTIMATED_IMAGE_SIZE_KB > maxBatchSizeKB && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchSizeKB = 0;
    }

    currentBatch.push(image);
    currentBatchSizeKB += ESTIMATED_IMAGE_SIZE_KB;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`[AI] Created ${batches.length} batches`);

  // Process each batch and collect posts
  const allPosts = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`[AI] Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images`);

    const posts = await processBatch(batch, date, batchIndex);

    allPosts.push(...posts);

    // Stop if we have enough posts
    if (allPosts.length >= 3) {
      console.log(`[AI] Reached ${allPosts.length} posts, stopping`);
      break;
    }
  }

  console.log(`[AI] Generated ${allPosts.length} total posts`);
  return allPosts.slice(0, 5); // Cap at 5 posts
}

/**
 * Generate a single Instagram post from user-selected images
 * Creates ONE combined caption that references all selected images
 */
export async function generateCombinedPost({ images, date }) {
  if (!anthropic) {
    throw new Error('Claude client not configured');
  }

  if (!images || images.length === 0) {
    throw new Error('No images provided');
  }

  if (images.length > 5) {
    throw new Error('Maximum 5 images can be selected');
  }

  console.log(`[AI] Generating combined post from ${images.length} selected images`);
  console.log(`[AI] Using Claude model: ${CLAUDE_MODEL}`);

  const contentBlocks = [];

  // Add intro text
  contentBlocks.push({
    type: 'text',
    text: `You are a social media manager for a school. Today's date is ${date.toISOString().split('T')[0]}.

A user has selected ${images.length} image${images.length > 1 ? 's' : ''} to create an Instagram post.

Your task is to:
1. Review all ${images.length} image${images.length > 1 ? 's' : ''} and their associated email content
2. Write ONE engaging Instagram caption that captures the essence of all the images together
3. The caption should be engaging, upbeat, and mention key details
4. Maximum 60 words

Here are the selected images:\n\n`
  });

  // Add each image with context
  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    contentBlocks.push({
      type: 'text',
      text: `--- Image ${index + 1} ---
Subject: ${image.subject ?? 'No subject'}
From: ${image.sender ?? 'Unknown'}
Text: ${(image.textContent ?? '').slice(0, 500)}\n`
    });

    // Convert image URL to base64 (handles both data URLs and HTTP URLs)
    try {
      const { mediaType, base64Data } = await imageUrlToBase64(image.imageUrl);

      // Log image size for debugging
      const sizeInMB = (base64Data.length * 0.75) / (1024 * 1024);
      console.log(`[AI] User-selected image ${index + 1}: ${sizeInMB.toFixed(2)}MB`);

      // Skip images over 5MB
      if (sizeInMB > 5) {
        console.warn(`[AI] Skipping image ${index + 1}: too large (${sizeInMB.toFixed(2)}MB)`);
        contentBlocks.push({
          type: 'text',
          text: '[Image too large to process]\n'
        });
        continue;
      }

      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data
        }
      });
    } catch (error) {
      console.warn(`[AI] Failed to process image ${index + 1}:`, error.message);
      contentBlocks.push({
        type: 'text',
        text: '[Image could not be loaded]\n'
      });
    }

    contentBlocks.push({
      type: 'text',
      text: '\n'
    });
  }

  // Add instructions for response format
  contentBlocks.push({
    type: 'text',
    text: `\n\nNow write a single Instagram caption that captures all ${images.length} image${images.length > 1 ? 's' : ''}. Respond in valid JSON with this exact shape:
{
  "caption": "Your engaging Instagram caption here...",
  "reasoning": "Brief explanation of your caption choice"
}

Make the caption upbeat, engaging, and suitable for parents and students.`
  });

  // Retry logic for overloaded errors
  let response;
  let retries = 3;
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[AI] Sending request to Claude (attempt ${i + 1}/${retries})...`);
      response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        temperature: 0.7,
        system: 'You are an expert social media manager for schools. You have a great eye for crafting compelling Instagram captions that capture multiple moments and activities.',
        messages: [
          {
            role: 'user',
            content: contentBlocks
          }
        ]
      });
      break; // Success, exit retry loop
    } catch (error) {
      lastError = error;
      console.error(`[AI] Attempt ${i + 1} failed:`, error.message);

      // If it's an overloaded error and we have retries left, wait and retry
      if (error.status === 529 && i < retries - 1) {
        const waitTime = (i + 1) * 2000; // 2s, 4s, 6s
        console.log(`[AI] Claude overloaded, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error; // No more retries or different error
      }
    }
  }

  if (!response) {
    throw lastError || new Error('Failed to get response from Claude');
  }

  const messageContent = response.content?.[0]?.text ?? '{}';

  try {
    // Strip markdown code fences if present (```json ... ```)
    let jsonString = messageContent.trim();
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```(?:json|JSON)?\n?/, '');
      jsonString = jsonString.replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonString);
    if (!parsed.caption) {
      throw new Error('No caption in response');
    }

    // Use the first image's URL as the primary source_image_url
    // In a more advanced implementation, you might combine multiple images
    const imageUrls = images
      .map((img) => img.imageUrl)
      .filter(Boolean);

    const post = {
      caption_text: parsed.caption,
      email_id: images[0].emailId, // Link to first email
      source_image_url: images[0].imageUrl, // Use first image
      source_image_urls: imageUrls.length > 0 ? imageUrls : null,
      created_at: new Date().toISOString()
    };

    console.log(`[AI] Generated combined post successfully`);
    return post;
  } catch (error) {
    console.error('[AI] Failed to parse Claude response:', error);
    console.error('[AI] Response was:', messageContent);
    throw new Error('Failed to generate caption');
  }
}

/**
 * Process a single batch of images with Claude
 */
async function processBatch(batch, date, batchIndex) {
  const contentBlocks = [];

  // Add intro text
  contentBlocks.push({
    type: 'text',
    text: `You are a social media manager for a school. Today's date is ${date.toISOString().split('T')[0]}.

You will review ${batch.length} images with their associated email content from today. Your task is to:

1. Review all the images and their associated email content
2. Select the 3-5 BEST image+caption combinations that would work great for Instagram
3. For each selected image, write an engaging Instagram caption (max 60 words, upbeat, mention key details)

Focus on images that are:
- Visually appealing and clear
- Show engaging activities or moments
- Would resonate with parents and students

Here are the images with their context:\n\n`
  });

  // Add each image with its context
  for (let imageIndex = 0; imageIndex < batch.length; imageIndex++) {
    const image = batch[imageIndex];
    // Add image context
    contentBlocks.push({
      type: 'text',
      text: `--- Image ${imageIndex + 1} ---
Subject: ${image.subject ?? 'No subject'}
From: ${image.sender ?? 'Unknown'}
Text content: ${(image.textContent ?? '').slice(0, 1500)}\n`
    });

    // Convert image URL to base64 (handles both data URLs and HTTP URLs)
    try {
      const { mediaType, base64Data } = await imageUrlToBase64(image.imageUrl);

      // Log image size for debugging
      const sizeInMB = (base64Data.length * 0.75) / (1024 * 1024); // base64 is ~1.33x larger than binary
      console.log(`[AI] Image ${imageIndex + 1}: ${sizeInMB.toFixed(2)}MB`);

      // Anthropic's API has limits - skip images over 5MB
      if (sizeInMB > 5) {
        console.warn(`[AI] Skipping image ${imageIndex + 1}: too large (${sizeInMB.toFixed(2)}MB)`);
        continue;
      }

      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data
        }
      });
    } catch (error) {
      console.warn(`[AI] Failed to process image ${imageIndex + 1}:`, error.message);
      // Skip this image and continue
    }

    contentBlocks.push({
      type: 'text',
      text: '\n'
    });
  }

  // Add instructions for response format
  contentBlocks.push({
    type: 'text',
    text: `\n\nNow, select the 3-5 best image+caption combinations. Respond in valid JSON with this exact shape:
{
  "selections": [
    {
      "image_index": 0,
      "caption": "Your engaging Instagram caption here...",
      "reasoning": "Brief explanation of why this image works well"
    }
  ]
}

The image_index is 0-based (Image 1 = index 0).
Make sure to pick the most visually appealing and engaging combinations.`
  });

  // Retry logic for overloaded errors
  let response;
  let retries = 3;
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[AI] Sending request to Claude (attempt ${i + 1}/${retries})...`);
      response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        temperature: 0.7,
        system: 'You are an expert social media manager for schools. You have a great eye for selecting engaging photos and writing compelling Instagram captions.',
        messages: [
          {
            role: 'user',
            content: contentBlocks
          }
        ]
      });
      break; // Success, exit retry loop
    } catch (error) {
      lastError = error;
      console.error(`[AI] Attempt ${i + 1} failed:`, error.message);

      // If it's an overloaded error and we have retries left, wait and retry
      if (error.status === 529 && i < retries - 1) {
        const waitTime = (i + 1) * 2000; // 2s, 4s, 6s
        console.log(`[AI] Claude overloaded, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error; // No more retries or different error
      }
    }
  }

  if (!response) {
    throw lastError || new Error('Failed to get response from Claude');
  }

  const messageContent = response.content?.[0]?.text ?? '{}';

  try {
    // Strip markdown code fences if present (```json ... ```)
    let jsonString = messageContent.trim();
    if (jsonString.startsWith('```')) {
      // Remove opening fence (```json or ```JSON or just ```)
      jsonString = jsonString.replace(/^```(?:json|JSON)?\n?/, '');
      // Remove closing fence
      jsonString = jsonString.replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed.selections) || parsed.selections.length === 0) {
      console.warn('Claude returned no selections, using fallback');
      return [];
    }

    // Map Claude's selections back to actual email IDs and image URLs
    const captions = parsed.selections.map((selection) => {
      const image = batch[selection.image_index];
      if (!image) {
        console.warn(`Invalid image_index ${selection.image_index}`);
        return null;
      }

      const imageUrls = image.imageUrl ? [image.imageUrl] : [];

      return {
        caption_text: selection.caption,
        email_id: image.emailId,
        source_image_url: image.imageUrl,
        source_image_urls: imageUrls.length > 0 ? imageUrls : null,
        created_at: new Date().toISOString()
      };
    }).filter(Boolean); // Remove any null entries

    console.log(`Generated ${captions.length} captions from ${batch.length} images`);
    return captions;
  } catch (error) {
    console.error('Failed to parse Claude response:', error);
    console.error('Response was:', messageContent);
    throw new Error('Claude response parsing failed');
  }
}
