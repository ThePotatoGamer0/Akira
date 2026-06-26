declare module 'astro:content' {
	interface Render {
		'.mdx': Promise<{
			Content: import('astro').MarkdownInstance<{}>['Content'];
			headings: import('astro').MarkdownHeading[];
			remarkPluginFrontmatter: Record<string, any>;
			components: import('astro').MDXInstance<{}>['components'];
		}>;
	}
}

declare module 'astro:content' {
	interface RenderResult {
		Content: import('astro/runtime/server/index.js').AstroComponentFactory;
		headings: import('astro').MarkdownHeading[];
		remarkPluginFrontmatter: Record<string, any>;
	}
	interface Render {
		'.md': Promise<RenderResult>;
	}

	export interface RenderedContent {
		html: string;
		metadata?: {
			imagePaths: Array<string>;
			[key: string]: unknown;
		};
	}
}

declare module 'astro:content' {
	type Flatten<T> = T extends { [K: string]: infer U } ? U : never;

	export type CollectionKey = keyof AnyEntryMap;
	export type CollectionEntry<C extends CollectionKey> = Flatten<AnyEntryMap[C]>;

	export type ContentCollectionKey = keyof ContentEntryMap;
	export type DataCollectionKey = keyof DataEntryMap;

	type AllValuesOf<T> = T extends any ? T[keyof T] : never;
	type ValidContentEntrySlug<C extends keyof ContentEntryMap> = AllValuesOf<
		ContentEntryMap[C]
	>['slug'];

	/** @deprecated Use `getEntry` instead. */
	export function getEntryBySlug<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(
		collection: C,
		// Note that this has to accept a regular string too, for SSR
		entrySlug: E,
	): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;

	/** @deprecated Use `getEntry` instead. */
	export function getDataEntryById<C extends keyof DataEntryMap, E extends keyof DataEntryMap[C]>(
		collection: C,
		entryId: E,
	): Promise<CollectionEntry<C>>;

	export function getCollection<C extends keyof AnyEntryMap, E extends CollectionEntry<C>>(
		collection: C,
		filter?: (entry: CollectionEntry<C>) => entry is E,
	): Promise<E[]>;
	export function getCollection<C extends keyof AnyEntryMap>(
		collection: C,
		filter?: (entry: CollectionEntry<C>) => unknown,
	): Promise<CollectionEntry<C>[]>;

	export function getEntry<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(entry: {
		collection: C;
		slug: E;
	}): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof DataEntryMap,
		E extends keyof DataEntryMap[C] | (string & {}),
	>(entry: {
		collection: C;
		id: E;
	}): E extends keyof DataEntryMap[C]
		? Promise<DataEntryMap[C][E]>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(
		collection: C,
		slug: E,
	): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof DataEntryMap,
		E extends keyof DataEntryMap[C] | (string & {}),
	>(
		collection: C,
		id: E,
	): E extends keyof DataEntryMap[C]
		? Promise<DataEntryMap[C][E]>
		: Promise<CollectionEntry<C> | undefined>;

	/** Resolve an array of entry references from the same collection */
	export function getEntries<C extends keyof ContentEntryMap>(
		entries: {
			collection: C;
			slug: ValidContentEntrySlug<C>;
		}[],
	): Promise<CollectionEntry<C>[]>;
	export function getEntries<C extends keyof DataEntryMap>(
		entries: {
			collection: C;
			id: keyof DataEntryMap[C];
		}[],
	): Promise<CollectionEntry<C>[]>;

	export function render<C extends keyof AnyEntryMap>(
		entry: AnyEntryMap[C][string],
	): Promise<RenderResult>;

	export function reference<C extends keyof AnyEntryMap>(
		collection: C,
	): import('astro/zod').ZodEffects<
		import('astro/zod').ZodString,
		C extends keyof ContentEntryMap
			? {
					collection: C;
					slug: ValidContentEntrySlug<C>;
				}
			: {
					collection: C;
					id: keyof DataEntryMap[C];
				}
	>;
	// Allow generic `string` to avoid excessive type errors in the config
	// if `dev` is not running to update as you edit.
	// Invalid collection names will be caught at build time.
	export function reference<C extends string>(
		collection: C,
	): import('astro/zod').ZodEffects<import('astro/zod').ZodString, never>;

	type ReturnTypeOrOriginal<T> = T extends (...args: any[]) => infer R ? R : T;
	type InferEntrySchema<C extends keyof AnyEntryMap> = import('astro/zod').infer<
		ReturnTypeOrOriginal<Required<ContentConfig['collections'][C]>['schema']>
	>;

	type ContentEntryMap = {
		"commands": {
"burn.md": {
	id: "burn.md";
  slug: "burn";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"collection.md": {
	id: "collection.md";
  slug: "collection";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"cooldowns.md": {
	id: "cooldowns.md";
  slug: "cooldowns";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"daily.md": {
	id: "daily.md";
  slug: "daily";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"drop.md": {
	id: "drop.md";
  slug: "drop";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"dye.md": {
	id: "dye.md";
  slug: "dye";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"give.md": {
	id: "give.md";
  slug: "give";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"grab.md": {
	id: "grab.md";
  slug: "grab";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"lookup.md": {
	id: "lookup.md";
  slug: "lookup";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"multiburn.md": {
	id: "multiburn.md";
  slug: "multiburn";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"shop.md": {
	id: "shop.md";
  slug: "shop";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"trade.md": {
	id: "trade.md";
  slug: "trade";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"userinfo.md": {
	id: "userinfo.md";
  slug: "userinfo";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
"wishlist.md": {
	id: "wishlist.md";
  slug: "wishlist";
  body: string;
  collection: "commands";
  data: any
} & { render(): Render[".md"] };
};
"contributing": {
"adding-characters.md": {
	id: "adding-characters.md";
  slug: "adding-characters";
  body: string;
  collection: "contributing";
  data: any
} & { render(): Render[".md"] };
"code.md": {
	id: "code.md";
  slug: "code";
  body: string;
  collection: "contributing";
  data: any
} & { render(): Render[".md"] };
"documentation.md": {
	id: "documentation.md";
  slug: "documentation";
  body: string;
  collection: "contributing";
  data: any
} & { render(): Render[".md"] };
"local-setup.mdx": {
	id: "local-setup.mdx";
  slug: "local-setup";
  body: string;
  collection: "contributing";
  data: any
} & { render(): Render[".mdx"] };
};
"economy": {
"bits.md": {
	id: "bits.md";
  slug: "bits";
  body: string;
  collection: "economy";
  data: any
} & { render(): Render[".md"] };
"personal-milestone.md": {
	id: "personal-milestone.md";
  slug: "personal-milestone";
  body: string;
  collection: "economy";
  data: any
} & { render(): Render[".md"] };
"server-pool.md": {
	id: "server-pool.md";
  slug: "server-pool";
  body: string;
  collection: "economy";
  data: any
} & { render(): Render[".md"] };
};
"getting-started": {
"importing-from-karuta.md": {
	id: "importing-from-karuta.md";
  slug: "importing-from-karuta";
  body: string;
  collection: "getting-started";
  data: any
} & { render(): Render[".md"] };
"what-is-akira.md": {
	id: "what-is-akira.md";
  slug: "what-is-akira";
  body: string;
  collection: "getting-started";
  data: any
} & { render(): Render[".md"] };
"your-first-card.md": {
	id: "your-first-card.md";
  slug: "your-first-card";
  body: string;
  collection: "getting-started";
  data: any
} & { render(): Render[".md"] };
};
"prestige": {
"overview.md": {
	id: "overview.md";
  slug: "overview";
  body: string;
  collection: "prestige";
  data: any
} & { render(): Render[".md"] };
};
"webui": {
"authentication.md": {
	id: "authentication.md";
  slug: "authentication";
  body: string;
  collection: "webui";
  data: any
} & { render(): Render[".md"] };
"collection.md": {
	id: "collection.md";
  slug: "collection";
  body: string;
  collection: "webui";
  data: any
} & { render(): Render[".md"] };
"economy-and-leaderboard.md": {
	id: "economy-and-leaderboard.md";
  slug: "economy-and-leaderboard";
  body: string;
  collection: "webui";
  data: any
} & { render(): Render[".md"] };
};

	};

	type DataEntryMap = {
		
	};

	type AnyEntryMap = ContentEntryMap & DataEntryMap;

	export type ContentConfig = never;
}
