# App overview #

This app is designed for schools and other organizations that want to automatically generate social media content from daily emails. The system ingests forwarded emails, extracts relevant text and images, uses AI to generate social media captions, and presents ready-to-post Instagram cards in a dashboard for easy review and publishing. The users will login to the app, so the app will need authentication. 

## Main User Features ##

`1. Home / Dashboard` 
- Displays a table of emails that have been forwarded and parsed. 
- Columns include: Email, subject line, Sender, Recipient, Date/time received. This shows the user to that emails were successfully processed by the system. 
- Also displays AI-generated social media posts outlined below 

`2. AI Social Media Content Generation`
- Generates three Instagram-ready post captions per day based on the parsed emails.
- Displays posts in a clear, copy-and-pasteable format. 
- Posts can optionally include suggested images extracted from the emails. 

`3. End-of-Day Automation` 
- Uses a scheduled job (cron) to aggregate emails and generate posts daily. 
- Optionally sends notifications to the user that the posts are ready. 

## Tech Stack ##
- Backend: Node.js (Express server, persistent server — not serverless) 
- Frontend: React 
- Database: PostgreSQL / Supabase (tables for raw emails, parsed content, AI-generated captions) 
- Email Handling: Mailgun (receives forwarded emails and posts to /api/webhooks) 
- AI Services: OpenAI or Claude API (for text/caption generation) 
- Scheduling: Cron job on server to run daily AI generation 

## Architecture ## 
- Frontend communicates with backend via REST API (/api/emails, /api/daily-posts)
- Backend Node.js Express server /api/webhooks endpoint: 
    - Receives POST requests from Mailgun with forwarded email data.
    - Parses emails to extract text and images. 
    - Updates database tables accordingly. 
- Scheduled task (cron):
    - Queries database for new emails. 
    - Calls AI API (OpenAI or Claude) to generate Instagram captions. 
    - Stores AI-generated captions in database. 
    
## Database Structural Suggestions ##
- There would be authentication from betterauth, which generates user tables here. 
- Emails Table
    - email id (primary key) 
    - sender 
    - recipient 
    - subject 
    - received_at (timestamp) 
    - raw_text 
- Parsed Email / Content Table 
    - email_id (foreign key to Emails) 
    - text_content 
    - image_urls (array) 
    - processed (boolean) 
- AI-Generated Posts Table
    - caption_text image_url (optional) 
    - created_at (timestamp) 
    
## Workflow ##
1. User forwards emails → Mailgun.
2. Mailgun POSTs email to /api/webhooks. 
3. Webhook extracts text and images → stores in database. 
4. Cron job runs at end of day: 
    - Queries new emails 
    - Generates 3 AI Instagram captions 
    - Saves results in database 
5. React dashboard fetches: 
    - Parsed email table Daily
    - AI-generated posts 
6. User reviews dashboard and copies posts to Instagram.
