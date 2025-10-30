#!/usr/bin/env node
/**
 * Encode DATABASE_URL with special characters in password
 * Usage: node encode-db-url.js
 */

const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n🔐 Database URL Encoder\n');
console.log('Enter your database connection details:\n');

const questions = [
    { key: 'user', prompt: 'Username (default: postgres): ' },
    { key: 'password', prompt: 'Password: ' },
    { key: 'host', prompt: 'Host (default: localhost): ' },
    { key: 'port', prompt: 'Port (default: 5432): ' },
    { key: 'database', prompt: 'Database name: ' },
];

const answers = {};
let i = 0;

function ask() {
    if (i < questions.length) {
        rl.question(questions[i].prompt, (answer) => {
            answers[questions[i].key] = answer || getDefault(questions[i].key);
            i++;
            ask();
        });
    } else {
        rl.close();
        generateUrl();
    }
}

function getDefault(key) {
    const defaults = {
        user: 'postgres',
        host: 'localhost',
        port: '5432'
    };
    return defaults[key] || '';
}

function generateUrl() {
    const { user, password, host, port, database } = answers;

    if (!password || !database) {
        console.error('\n❌ Password and database name are required!\n');
        process.exit(1);
    }

    // URL encode the password
    const encodedPassword = encodeURIComponent(password);

    const url = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;

    console.log('\n✅ Encoded DATABASE_URL:\n');
    console.log(url);
    console.log('\n📋 Add this to your .env file:');
    console.log(`DATABASE_URL=${url}`);
    console.log('\n💡 Special characters encoded:');
    if (password !== encodedPassword) {
        console.log(`   Original:  ${password}`);
        console.log(`   Encoded:   ${encodedPassword}`);
    } else {
        console.log('   (no special characters found)');
    }
    console.log('');
}

// Quick mode: if password provided as argument
if (process.argv[2]) {
    console.log('\n🔐 Quick encode password:\n');
    const password = process.argv[2];
    const encoded = encodeURIComponent(password);
    console.log(`Original: ${password}`);
    console.log(`Encoded:  ${encoded}`);
    console.log('');
    process.exit(0);
} else {
    ask();
}

