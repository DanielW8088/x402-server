/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    webpack: (config, { isServer }) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            net: false,
            tls: false,
            crypto: false,
        };

        config.externals.push('pino-pretty', 'lokijs', 'encoding');

        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                '@react-native-async-storage/async-storage': false,
                'react-native': false,
                'react-native-get-random-values': false,
            };
        }

        config.ignoreWarnings = [
            { module: /node_modules\/@metamask\/sdk/ },
            /Critical dependency: the request of a dependency is an expression/,
        ];

        return config;
    },
}

module.exports = nextConfig

