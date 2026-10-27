function publicModel(model) {
    return {
        id: model.id,
        ...(model.name === undefined ? {} : { name: model.name }),
        ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
        ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
    };
}
async function credentialConfigured(host, ref) {
    if (ref === '')
        return false;
    if (host.envShadows(ref))
        return true;
    return (await host.readCredential(ref)) !== undefined;
}
/**
 * Adapt the same settings, credential, and model-discovery seams used by
 * `/provider` to the local FlagQAI Server. Secret values only move from the
 * request to the credential store and are never included in a response.
 */
export function createProviderManager(host, selectModel, deriveKeyRef) {
    return {
        async status() {
            const catalog = host.listCatalogProviders().map(item => ({
                route: item.provider,
                label: item.displayName,
            }));
            const configured = await Promise.all(host.listConfiguredProviders({ effective: true }).map(async (item) => ({
                route: item.route,
                kind: item.isCatalog ? 'catalog' : 'custom',
                ...(item.baseURL === undefined ? {} : { baseURL: item.baseURL }),
                ...(item.api === undefined ? {} : { api: item.api }),
                models: [...(item.models ?? [])],
                keyConfigured: await credentialConfigured(host, item.ref),
            })));
            const catalogCredential = (await Promise.all(catalog.map(item => credentialConfigured(host, deriveKeyRef(item.route))))).some(Boolean);
            return {
                ready: catalogCredential || configured.some(item => item.keyConfigured),
                catalog,
                configured,
            };
        },
        async discover(input) {
            const requests = [];
            const existing = host.listConfiguredProviders({ effective: true }).find(item => item.route === input.route);
            if (existing !== undefined && input.apiKey === undefined
                && input.baseURL === existing.baseURL && input.api === existing.api) {
                return (await host.discoverModels({
                    provider: input.route,
                    ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL }),
                    ...(input.api === undefined ? {} : { api: input.api }),
                })).map(publicModel);
            }
            if (input.kind === 'catalog' && input.baseURL === undefined)
                requests.push({ provider: input.route, ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }) });
            if (input.kind === 'custom' || input.baseURL !== undefined) {
                requests.push({
                    ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL }),
                    ...(input.api === undefined ? {} : { api: input.api }),
                    ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
                });
            }
            const discovered = (await Promise.all(requests.map(request => host.discoverModels(request)))).flat();
            return [...new Map(discovered.map(model => [model.id, publicModel(model)])).values()];
        },
        async configure(input) {
            const catalog = new Set(host.listCatalogProviders().map(item => item.provider));
            if (input.kind === 'catalog' && !catalog.has(input.route)) {
                throw new Error(`Unknown catalog provider route: ${input.route}`);
            }
            if (input.kind === 'custom' && catalog.has(input.route)) {
                throw new Error(`Catalog provider route cannot be configured as custom: ${input.route}`);
            }
            const existing = host.listConfiguredProviders({ effective: true }).find(item => item.route === input.route);
            const ref = existing?.ref || deriveKeyRef(input.route);
            const shadowed = host.envShadows(ref);
            let previousCredential;
            let wroteCredential = false;
            if (!shadowed && input.apiKey !== undefined) {
                previousCredential = await host.readCredential(ref);
                await host.writeCredential(ref, input.apiKey);
                wroteCredential = true;
            }
            try {
                const profile = {
                    apiKeyEnv: ref,
                    ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL }),
                    ...(input.api === undefined ? {} : { api: input.api }),
                    models: input.models.map(id => existing?.modelEntries?.find(entry => entry.id === id) ?? { id }),
                };
                if (host.routeExists(input.route)) {
                    await host.mutateProfile(input.route, Object.entries(profile).map(([key, value]) => ({ op: 'set', path: [key], value })));
                }
                else {
                    await host.writeProfile(input.route, profile);
                }
            }
            catch (error) {
                if (wroteCredential) {
                    if (previousCredential === undefined)
                        await host.removeCredential(ref);
                    else
                        await host.writeCredential(ref, previousCredential);
                }
                throw error;
            }
            const model = input.models[0];
            if (!selectModel(input.route, model))
                throw new Error('Provider saved, but the default model preference could not be persisted');
            return {
                route: input.route,
                model,
                keyConfigured: await credentialConfigured(host, ref),
            };
        },
    };
}
