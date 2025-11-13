update ai_generated_posts
   set source_image_urls = array[source_image_url]
 where source_image_url is not null
   and coalesce(array_length(source_image_urls, 1), 0) = 0;
