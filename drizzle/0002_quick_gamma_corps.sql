CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`plan` enum('free','pro') NOT NULL DEFAULT 'free',
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`stripeCustomerId` varchar(64),
	`stripeSubscriptionId` varchar(64),
	`currentPeriodEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `idx_sub_user` ON `subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_sub_stripe_customer` ON `subscriptions` (`stripeCustomerId`);--> statement-breakpoint
CREATE INDEX `idx_sub_stripe_sub` ON `subscriptions` (`stripeSubscriptionId`);