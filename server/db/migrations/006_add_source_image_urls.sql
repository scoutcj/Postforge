alter table ai_generated_posts
  add column if not exists source_image_urls text[];

update ai_generated_posts
   set source_image_urls = array[source_image_url]
 where source_image_url is not null
   and (source_image_urls is null or array_length(source_image_urls, 1) = 0);
