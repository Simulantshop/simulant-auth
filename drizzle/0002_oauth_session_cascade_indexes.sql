CREATE INDEX IF NOT EXISTS `oauth_refresh_token_sessionId_idx` ON `oauth_refresh_token` (`session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oauth_access_token_sessionId_idx` ON `oauth_access_token` (`session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oauth_access_token_refreshId_idx` ON `oauth_access_token` (`refresh_id`);
