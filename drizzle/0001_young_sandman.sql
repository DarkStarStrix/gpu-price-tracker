CREATE TABLE `gpu_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`offerId` varchar(128) NOT NULL,
	`providerId` varchar(64) NOT NULL,
	`providerName` varchar(128) NOT NULL,
	`gpuModelId` varchar(64) NOT NULL,
	`gpuModelName` varchar(128) NOT NULL,
	`gpuCount` int NOT NULL DEFAULT 1,
	`vramPerGpuGb` int NOT NULL,
	`vcpus` int NOT NULL DEFAULT 0,
	`ramGb` int NOT NULL DEFAULT 0,
	`region` varchar(128) NOT NULL DEFAULT 'us-east',
	`pricePerGpuHr` float NOT NULL,
	`totalNodePriceHr` float NOT NULL,
	`availability` enum('available','limited','unavailable') NOT NULL DEFAULT 'available',
	`providerLink` text NOT NULL,
	`cloudType` varchar(32),
	`dataSource` varchar(32) NOT NULL DEFAULT 'static',
	`lastPolledAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gpu_offers_id` PRIMARY KEY(`id`),
	CONSTRAINT `gpu_offers_offerId_unique` UNIQUE(`offerId`)
);
--> statement-breakpoint
CREATE TABLE `poll_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL,
	`success` boolean NOT NULL DEFAULT true,
	`offersCount` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`durationMs` int NOT NULL DEFAULT 0,
	`polledAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `poll_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`offerId` varchar(128) NOT NULL,
	`providerId` varchar(64) NOT NULL,
	`gpuModelId` varchar(64) NOT NULL,
	`pricePerGpuHr` float NOT NULL,
	`availability` enum('available','limited','unavailable') NOT NULL,
	`snapshotAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_provider` ON `gpu_offers` (`providerId`);--> statement-breakpoint
CREATE INDEX `idx_gpu_model` ON `gpu_offers` (`gpuModelId`);--> statement-breakpoint
CREATE INDEX `idx_availability` ON `gpu_offers` (`availability`);--> statement-breakpoint
CREATE INDEX `idx_snap_offer` ON `price_snapshots` (`offerId`);--> statement-breakpoint
CREATE INDEX `idx_snap_gpu` ON `price_snapshots` (`gpuModelId`);--> statement-breakpoint
CREATE INDEX `idx_snap_time` ON `price_snapshots` (`snapshotAt`);