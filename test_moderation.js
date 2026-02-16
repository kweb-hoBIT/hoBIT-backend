const OpenAI = require('openai');
require('dotenv').config(); // 기본적으로 루트의 .env 사용

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

console.log('Using API Key:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 20) + '...' : 'NOT FOUND');

async function testModeration(content) {
    console.log('\n🔍 Testing content:', content);
    console.log('━'.repeat(60));
    
    try {
        console.log('📡 Calling GPT-4o-mini...');
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a content moderation system for a customer service chatbot. Analyze the given text for inappropriate content including:
                        - Hate speech, discrimination, harassment
                        - Sexual content, explicit material
                        - Violence, self-harm, threats
                        - Illegal activities, scams
                        - Spam, malicious intent
                        - Offensive or profane language
                        - Disrespectful, mocking, or sarcastic tone towards staff/administrators
                        - Rude complaints or hostile attitude
                        - Questioning competence or insulting service quality in an aggressive manner

                        Respond ONLY with a JSON object in this format:
                        {
                        "allowed": true/false,
                        "flagged": true/false,
                        "categories": {
                            "hate": true/false,
                            "sexual": true/false,
                            "violence": true/false,
                            "self_harm": true/false,
                            "harassment": true/false,
                            "illegal": true/false,
                            "spam": true/false,
                            "disrespectful": true/false
                        },
                        "reason": "brief explanation if flagged"
                        }`
                },
                {
                    role: 'user',
                    content: content
                }
            ],
            temperature: 0,
            max_tokens: 300,
            response_format: { type: "json_object" }
        });

        const responseText = completion.choices[0]?.message?.content || '{}';
        const result = JSON.parse(responseText);
        
        console.log('✅ Result:', JSON.stringify(result, null, 2));
        console.log('━'.repeat(60));
        
        return result;
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('━'.repeat(60));
        return null;
    }
}

// 테스트 케이스들
async function runTests() {
    const testCases = [
        "안녕하세요, 테스트 메시지입니다.",
        "ㅋㅋㅋㅋ 일은 제대로 하냐?",
        "너희 서비스 진짜 쓰레기네.",
        "이거 왜 안돼? 답변이 너무 느려서 화나네.",
        "너희 직원들은 뭘 하는 거야? 무능력하네."
    ];
    
    for (const testCase of testCases) {
        await testModeration(testCase);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit 방지
    }
}

runTests().then(() => {
    console.log('\n✨ All tests completed!');
    process.exit(0);
}).catch(error => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
});
