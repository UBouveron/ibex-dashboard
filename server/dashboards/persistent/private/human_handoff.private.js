return {
	id: "human_handoff",
	name: "Dashboard",
	icon: "question_answer",
	url: "human_handoff",
	description: "Monitor bot and hand-off to human conversations",
	preview: "/images/default.png",
	category: "Bots - Advanced",
	html: `<div>
      This dashboard displays the status for a bot-to-human handoff system.
      <br/>
      <br/>
      <h2>Features</h2>
      <ul>
        <li>
          <p>Displays total users including how many are talking with bot, human agent or waiting for an agent.</p>
        </li>
        <li>
          <p>Displays average time waiting (in secs) for human agent to connect and respond to user, 
            including the shortest and longest times.</p>
        </li>
        <li>
          <p>Displays total number of transcripts with bot or with human agent.</p>
        </li>
        <li>
          <p>Displays timeline of conversations with bot and human.</p>
        </li>
        <li>
          <p>Displays list of active conversations with sentiment score.</p>
          <p>If there is a conversation of interest this can be selected to show the option to hand-off to human.</p>
        </li>
      </ul>
      <p>
        <span>Refer to the </span>
        <span>
          <a href="https://github.com/Azure/ibex-dashboard/blob/master/docs/bot-framework.md" target="_blank">
            bot-framework
          </a> docs for setup instructions.</span>
      </p>
    </div>`,
	config: {
		connections: {
			"application-insights": { appId: "62753b46-c579-4329-a298-4322b3aa0e59",apiKey: "acbfzjwxqtwio3ok2voeeuv6doyqkureg6nmp2sp" },
			"bot-framework": {
				directLine: "IScfg-K49pY.cwA.GHw.qBj7JDTicWXLbP9B9aWUxqNCw6TZk-P_H-dqDbU2oO0",
				conversationsEndpoint: "http://localhost/api/conversations",
				webchatEndpoint: "http://localhost:9000/webchat"
			}
		},
		layout: {
			isDraggable: true,
			isResizable: true,
			rowHeight: 30,
			verticalCompact: false,
			cols: { lg: 12,md: 10,sm: 6,xs: 4,xxs: 2 },
			breakpoints: { lg: 1200,md: 996,sm: 768,xs: 480,xxs: 0 }
		}
	},
	dataSources: [
		{
			id: "timespan",
			type: "Constant",
			params: { values: ["24 hours","1 week","1 month","3 months"],selectedValue: "1 month" },
			format: "timespan"
		},
		{
			id: "samples",
			type: "Sample",
			params: {
				samples: {
					data_for_pie: [{ name: "value1",value: 60 },{ name: "value2",value: 10 },{ name: "value3",value: 30 }],
					scorecard_data_value: 3000000,
					scorecard_data_subvalue: 4000
				}
			}
		},
		{
			id: "filters",
			type: "ApplicationInsights/Query",
			dependencies: { timespan: "timespan",queryTimespan: "timespan:queryTimespan",granularity: "granularity" },
			params: {
				table: "customEvents",
				queries: {
					channels: {
						query: () => `
              where name == 'MBFEvent.UserMessage' 
              | extend value=tostring(customDimensions.channel) 
              | summarize channel_count=count() by value 
              | order by channel_count`,
						format: "filter"
					}/*,
					intents: {
						query: () => `
              extend value=tostring(customDimensions.intent), cslen=customDimensions.callstack_length 
              | where name=='MBFEvent.Intent' and (cslen == 0 or strlen(cslen) == 0) and strlen(value) > 0 
              | summarize intent_count=count() by value 
              | order by intent_count`,
						format: "filter"
					}*/
				}
			}
		},
		{
			id: "ai",
			type: "ApplicationInsights/Query",
			dependencies: { timespan: "timespan",queryTimespan: "timespan:queryTimespan",granularity: "timespan:granularity" },
			params: {
				table: "customEvents",
				queries: {
					transcripts: {
						query: () => `
              where name == 'Transcript'
              | extend conversationId=tostring(customDimensions.userConversationId), 
                customerName=tostring(customDimensions.customerName), 
                timestamp=todatetime(customDimensions.timestamp) 
              | project conversationId, customerName, timestamp, customDimensions
              | order by timestamp desc
              | summarize transcripts_count=count(timestamp), 
                transcripts=makelist(customDimensions) by customerName, conversationId
              | project conversationId, customerName, transcripts_count, transcripts`,
						calculated: (transcripts) => {
              const listTranscripts = transcripts.reduce(
                (destArray, currentValue) => {
                  const transcriptsArray = JSON.parse(currentValue.transcripts);
                  if (!Array.isArray(transcriptsArray)) {
                    return destArray;
                  }
                  const lastMessage = transcriptsArray.find(x => x.from === 'Customer');
                  if (!lastMessage) {
                    return destArray;
                  }
                  const lastSentimentScore = parseFloat(lastMessage.sentimentScore) || 0.5;
                  const lastState = parseInt(transcriptsArray[0].state, 10);
                  const value = {
                    userId: lastMessage.customerId,
                    conversationId: lastMessage.customerConversationId,
                    username: lastMessage.customerName || 'Anon',
                    timestamp: new Date(lastMessage.timestamp).toUTCString(),
                    lastMessage: lastMessage.text || '',
                    lastSentimentScore: lastSentimentScore,
                    lastSentiment: lastSentimentScore < 0 ? 'error_outline' :
                      lastSentimentScore < 0.2 ? 'sentiment_very_dissatisfied' :
                        lastSentimentScore < 0.4 ? 'sentiment_dissatisfied' :
                          lastSentimentScore < 0.6 ? 'sentiment_neutral' :
                            lastSentimentScore < 0.8 ? 'sentiment_satisfied' : 'sentiment_very_satisfied',
                    icon: lastState === 0 ? 'memory' :
                      lastState === 2 ? 'perm_identity' : 'more_horiz',
                  };
                  destArray.push(value);
                  return destArray;
                },
                []);
              return {
                'transcripts-values': listTranscripts
              };
            }
					},
					transcriptsTimeWaiting: {
						query: () => `
              where name == 'Transcript'
              | extend conversationId=tostring(customDimensions.userConversationId), 
                customerId=tostring(customDimensions.customerId), 
                state=toint(customDimensions.state)  
              | where state==1 or state==2
              | order by timestamp asc
              | summarize total=count(), times=makelist(timestamp) by conversationId, customerId, bin(state, 1)
              | project conversationId, customerId, state, startTime=times[0] 
              | summarize result=count(state), startEndTimes=makelist(startTime) by conversationId, customerId
              | where result == 2
              | project conversationId, customerId, timeTaken=todatetime(startEndTimes[1])-todatetime(startEndTimes[0])`,
						calculated: (results) => {
              const times = results.reduce(
                (acc, cur) => {
                  // converts time hh:mm:ss format to value in seconds
                  acc.push(cur.timeTaken.split(':').reverse().reduce((a, c, i) => a + c * Math.pow(60, i), 0));
                  return acc;
                },
                []);
              const avgTimeWaiting = times.reduce((a, c) => a + c, 0) / times.length;
              const maxTimeWaiting = Math.max(...times);
              const minTimeWaiting = Math.min(...times);
              const timeFormat = (secs) => {
                const time = new Date(secs * 1000);
                let t = time.getSeconds() + 's';
                if (time.getHours() > 0 && time.getMinutes() > 0) {
                  t = time.getHours() + 'h ' + time.getMinutes() + 'm';
                } else if (time.getMinutes() > 0) {
                  t = time.getMinutes() + 'm';
                }
                return t;
              };
              return {
                'transcriptsTimeWaiting-avg': isFinite(avgTimeWaiting) ? timeFormat(avgTimeWaiting) : '-',
                'transcriptsTimeWaiting-longest': isFinite(avgTimeWaiting) ? timeFormat(maxTimeWaiting) : '-',
                'transcriptsTimeWaiting-shortest': isFinite(avgTimeWaiting) ? timeFormat(minTimeWaiting) : '-',
              };
            }
					},
					timeline: {
						query: (dependencies) => {
              var { granularity } = dependencies;
              return `where name == 'Transcript' 
                | extend customerName=tostring(customDimensions.customerName), 
                  text=tostring(customDimensions.text), 
                  state=toint(customDimensions.state), 
                  agentName=tostring(customDimensions.agentName), 
                  from=tostring(customDimensions.from) 
                | extend timestamp=todatetime(customDimensions.timestamp) 
                | extend states=pack_array('bot','waiting','agent','watching')
                | extend stateLabel=tostring(states[state])
                | where state == 0 or state == 2
                | project timestamp, from, text, customerName, agentName, state, stateLabel 
                | summarize transcripts_count=count() 
                  by bin(timestamp, ${granularity}), state, stateLabel 
                | order by timestamp asc`;
            },
						calculated: (results, dependencies) => {
              const totalBot = results.reduce((a, c) => c.state === 0 ? a + c.transcripts_count : a, 0);
              const totalAgent = results.reduce((a, c) => c.state === 2 ? a + c.transcripts_count : a, 0);
              const totalMessages = totalBot + totalAgent;
              // Timeline 
              const { timespan } = dependencies;
              const keys = results.reduce(
                (keyArray, currentValue) => {
                  return keyArray.includes(currentValue.stateLabel) ? keyArray : [...keyArray, currentValue.stateLabel];
                },
                []);
              const timestampKey = 'time'; // NB: required key name for timeline component
              // group by timestamp
              const graphData = results.reduce(
                (a, c) => {
                  if (!c.timestamp) {
                    console.warn('Invalid date format:', c);
                    return a;
                  }
                  const item = a.find(collection => collection[timestampKey] === c.timestamp);
                  if (!item) {
                    // new time collection
                    let collection = {
                      count: 0
                    };
                    collection[timestampKey] = c.timestamp;
                    keys.forEach(key => {
                      collection[key] = (key !== c.stateLabel) ? 0 : c.transcripts_count;
                    });
                    a.push(collection);
                  } else {
                    // merge into time collection
                    item.count += c.transcripts_count;
                    item[c.stateLabel] += c.transcripts_count;
                  }
                  return a;
                },
                []);
              return {
                'timeline-graphData': graphData,
                'timeline-recipients': keys,
                'timeline-timeFormat': (timespan === '24 hours' ? 'hour' : 'date'),
                'timeline-bot': totalBot,
                'timeline-agent': totalAgent,
                'timeline-total': totalMessages,
              };
            }
					},
					customerTranscripts: {
						query: () => `
              where name == 'Transcript' 
              | extend customerId=tostring(customDimensions.customerId) 
              | extend state=toint(customDimensions.state) 
              | extend timestamp=todatetime(customDimensions.timestamp) 
              | project customerId, timestamp, state
              | order by timestamp desc
              | summarize transcripts_count=count(customerId), timestamps=makelist(timestamp) by customerId, state 
              | project customerId, state, transcripts_count, timestamp=timestamps[0]
              | summarize count(customerId), 
                totals=makelist(transcripts_count), 
                states=makelist(state), 
                timestamps=makelist(timestamp) by customerId
              | project customerId, state=toint(states[0]), transcripts_count=toint(totals[0]), timestamp=timestamps[0]`,
						calculated: (customerTranscripts) => {
              const bot = customerTranscripts.filter((customer) => customer.state === 0);
              const waiting = customerTranscripts.filter((customer) => customer.state === 1);
              const agent = customerTranscripts.filter((customer) => customer.state === 2);
              return {
                'customerTranscripts-total': customerTranscripts.length,
                'customerTranscripts-bot': bot.length,
                'customerTranscripts-waiting': waiting.length,
                'customerTranscripts-agent': agent.length,
              };
            }
					},
					intents: {
						query: () => `
              extend cslen=customDimensions.callstack_length, value=tostring(customDimensions.intent) 
              | where name=='MBFEvent.Intent' and (cslen == 0 or strlen(cslen) == 0) and strlen(value) > 0 
              | summarize count=count() by value`,
						filters: [{ dependency: "selectedIntents",queryProperty: "customDimensions.intent" }],
						format: "bars"
					},
                    words: {
                        query: () => `
                where name == 'Transcript'
              | extend conversationId=tostring(customDimensions.userConversationId), 
                customerName=tostring(customDimensions.customerName), 
                timestamp=todatetime(customDimensions.timestamp) 
              | project conversationId, customerName, timestamp, customDimensions
              | order by timestamp desc
              | summarize transcripts_count=count(timestamp), 
                transcripts=makelist(customDimensions) by customerName, conversationId
              | project conversationId, customerName, transcripts_count, transcripts`,
            
                    }
				}
			}
		}
	],
	filters: [
		{
			type: "TextFilter",
			title: "Timespan",
			source: "timespan",
			actions: { onChange: "timespan:updateSelectedValue" },
			first: true
		}
	],
	elements: [
		{
			id: "customerTranscripts",
			type: "Scorecard",
			title: "Users",
			size: { w: 6,h: 3 },
			dependencies: {
				card_total_heading: "::Total Users",
				card_total_tooltip: "::Total users",
				card_total_value: "ai:customerTranscripts-total",
				card_total_color: "::#666666",
				card_total_icon: "::account_circle",
				card_bot_heading: "::Bot",
				card_bot_tooltip: "::Total users talking to the bot",
				card_bot_value: "ai:customerTranscripts-bot",
				card_bot_color: "::#00FF00",
				card_bot_icon: "::memory",
				card_agent_heading: "::Agent",
				card_agent_tooltip: "::Total users talking to a human agent",
				card_agent_value: "ai:customerTranscripts-agent",
				card_agent_color: "::#0066FF",
				card_agent_icon: "::perm_identity",
				card_waiting_heading: "::En attente",
				card_waiting_tooltip: "::Total users waiting for a human agent to respond",
				card_waiting_value: "ai:customerTranscripts-waiting",
				card_waiting_color: "::#FF6600",
				card_waiting_icon: "::more_horiz"
			}
		},
		{
			id: "customerWaiting",
			type: "Scorecard",
			title: "Waiting Times",
			size: { w: 6,h: 3 },
			dependencies: {
				card_average_heading: "::Moyenne",
				card_average_tooltip: "::Temps moyen pour qu'un agent réponde",
				card_average_value: "ai:transcriptsTimeWaiting-avg",
				card_average_color: "::#333333",
				card_average_icon: "::av_timer",
				card_max_heading: "::Plus lent",
				card_max_tooltip: "::Temps le plus long pour qu'un agent réponde",
				card_max_value: "ai:transcriptsTimeWaiting-longest",
				card_max_color: "::#ff0000",
				card_max_icon: "::timer",
				card_min_heading: "::Plus rapide",
				card_min_tooltip: "::Temps le plus court pour qu'un agent réponde",
				card_min_value: "ai:transcriptsTimeWaiting-shortest",
				card_min_color: "::#0066ff",
				card_min_icon: "::timer"
			}
		},
		{
			id: "timelineScores",
			type: "Scorecard",
			title: "Transcripts",
			size: { w: 2,h: 8 },
			dependencies: {
				card_total_heading: "::Total Msgs",
				card_total_tooltip: "::Total messages",
				card_total_value: "ai:timeline-total",
				card_total_color: "::#666666",
				card_total_icon: "::question_answer",
				card_bot_heading: "::Bot",
				card_bot_tooltip: "::Total messages with bot",
				card_bot_value: "ai:timeline-bot",
				card_bot_color: "::#00FF00",
				card_bot_icon: "::memory",
				card_agent_heading: "::Agent",
				card_agent_tooltip: "::Total messages with a human",
				card_agent_value: "ai:timeline-agent",
				card_agent_color: "::#0066FF",
				card_agent_icon: "::perm_identity"
			}
		},
		{
			id: "words",
			type: "PieData",
			title: "Mots les plus utilisés",
			subtitle: "Hover on the values to see the difference from sample 1",
			size: { w: 5,h: 8 },
			dependencies: { values: "samples:data_for_pie" },
			props: { showLegend: true,compact: true }
		},
		{
			id: "timeline",
			type: "Area",
			title: "Conversations avec bot / humain",
			subtitle: "How many conversations required hand-off to human",
			size: { w: 10,h: 8 },
			dependencies: {
				values: "ai:timeline-graphData",
				lines: "ai:timeline-recipients",
				timeFormat: "ai:timeline-timeFormat"
			},
			props: { isStacked: false,showLegend: true }
		},
		{
			id: "transcripts",
			type: "Table",
			title: "Conversations récentes",
			subtitle: "Monitor bot communications",
			size: { w: 12,h: 19 },
			dependencies: { values: "ai:transcripts-values" },
			props: {
				cols: [
					{ header: "Timestamp",field: "timestamp",type: "time",format: "MMM-DD HH:mm:ss",width: "100px" },
					{ header: "Dernier message",field: "lastMessage" },
					{
						header: "Dernier sentiment",
						field: "lastSentiment",
						type: "icon",
						tooltip: "lastSentimentScore",
						tooltipPosition: "right"
					},
					{ header: "Nom d'utilisateur",field: "username" },
					{ header: "Statut",field: "icon",type: "icon" },
					{ type: "button",value: "chat",click: "openTranscriptsDialog" }
				]
			},
			actions: {
				openTranscriptsDialog: {
					action: "dialog:transcriptsDialog",
					params: { title: "args:username",conversationId: "args:conversationId",queryspan: "timespan:queryTimespan" }
				}
			}
		},
		{
			id: "intents",
			type: "BarData",
			title: "Intents",
			subtitle: "Intents usage per time",
			size: { w: 4,h: 8 },
			source: "ai:intents",
            props: {
                showLegend: false  
            },
			actions: {
				onBarClick: {
					action: "dialog:intentsDialog",
					params: { title: "args:value",intent: "args:value",queryspan: "timespan:queryTimespan" }
				}
			}
		}
	],
	dialogs: [
		{
			id: "transcriptsDialog",
			width: "60%",
			params: ["title","conversationId","queryspan"],
			dataSources: [
				{
					id: "transcriptsData",
					type: "ApplicationInsights/Query",
					dependencies: {
						username: "dialog_transcriptsDialog:title",
						conversationId: "dialog_transcriptsDialog:conversationId",
						queryTimespan: "dialog_transcriptsDialog:queryspan",
						secret: "connection:bot-framework.directLine"
					},
					params: {
						query: ({ conversationId }) => `
              customEvents 
              | where name == 'Transcript' 
              | where customDimensions.customerConversationId == '${conversationId}'
              | extend timestamp=tostring(customDimensions.timestamp)
              | project timestamp, 
                text=tostring(customDimensions.text), 
                sentimentScore=todouble(customDimensions.sentimentScore), 
                from=tostring(customDimensions.from),
                state=toint(customDimensions.state)
              | order by timestamp asc`
					},
					calculated: (state, dependencies) => {
            let { values } = state || [];
            if (!values || values.length < 1) {
              return null;
            }

            const { secret } = dependencies;
            const { conversationId } = dependencies;

            let body, headers = {};
            let disabled = values[values.length - 1].state !== 0 ? true : false;

            values.map(v => {
              const lastSentimentScore = v.sentimentScore || 0.5;
              v['sentiment'] = lastSentimentScore < 0 ? 'error_outline' :
                lastSentimentScore < 0.2 ? 'sentiment_very_dissatisfied' :
                  lastSentimentScore < 0.4 ? 'sentiment_dissatisfied' :
                    lastSentimentScore < 0.6 ? 'sentiment_neutral' :
                      lastSentimentScore < 0.8 ? 'sentiment_satisfied' : 'sentiment_very_satisfied';
            });

            body = {
              'conversationId': conversationId,
            };
            headers = {
              'Authorization': `Bearer ${secret}`
            };
            return { values, headers, body, disabled };
          }
				}
			],
			elements: [
				{
					id: "transcripts-button",
					type: "RequestButton",
					title: "Transfer to Agent",
					size: { w: 2,h: 1 },
					location: { x: 0,y: 0 },
					dependencies: {
						body: "transcriptsData:body",
						headers: "transcriptsData:headers",
						disabled: "transcriptsData:disabled",
						conversationsEndpoint: "connection:bot-framework.conversationsEndpoint"
					},
					props: {
						url: ({ conversationsEndpoint }) => `${conversationsEndpoint}`,
						method: "POST",
						disableAfterFirstClick: true,
						icon: "person",
						buttonProps: { iconBefore: false,primary: true }
					}
				},
				{
					id: "agent-button",
					type: "RequestButton",
					title: "Open Webchat",
					size: { w: 2,h: 1 },
					location: { x: 2,y: 0 },
					dependencies: {
						token: "connection:bot-framework.directLine",
						webchatEndpoint: "connection:bot-framework.webchatEndpoint",
						dependsOn: "transcriptsData:disabled"
					},
					props: {
						url: ({ token, webchatEndpoint }) => `${webchatEndpoint}/?s=${token}`,
						link: true,
						icon: "open_in_new",
						buttonProps: { iconBefore: false,secondary: true }
					}
				},
				{
					id: "transcriptsData",
					type: "Table",
					title: "Transcripts",
					size: { w: 12,h: 11 },
					location: { x: 0,y: 1 },
					dependencies: { values: "transcriptsData:values" },
					props: {
						rowClassNameField: "from",
						cols: [
							{ header: "Horodatage",field: "timestamp",type: "time",format: "MMM-DD HH:mm:ss",width: "50px" },
							{
								header: "Sentiment",
								field: "sentiment",
								tooltip: "sentimentScore",
								type: "icon",
								width: "50px",
								tooltipPosition: "right"
							},
							{ header: "Texte",field: "text" }
						]
					}
				}
			]
		},
		{
			id: "intentsDialog",
			width: "70%",
			params: ["title","intent","queryspan"],
			dataSources: [
				{
					id: "intents-data",
					type: "ApplicationInsights/Query",
					dependencies: {
						intent: "dialog_intentsDialog:intent",
						queryTimespan: "dialog_intentsDialog:queryspan",
						timespan: "timespan",
						granularity: "granularity"
					},
					params: {
						table: "customEvents",
						queries: {
							"intent-usage-timeline": {
								query: ({ intent, granularity }) => `
                  extend intent=(customDimensions.intent)
                  | where timestamp > ago(30d) and intent =~ '${intent}'
                  | summarize count=count() by bin(timestamp, ${granularity})
                  | order by timestamp`,
								format: { type: "timeline",args: { timeField: "timestamp",lineField: "intent",valueField: "count" } }
							},
							"entities-usage": {
								query: ({ intent }) => `
                  extend conversation=tostring(customDimensions.conversationId), 
                    entityType=tostring(customDimensions.entityType), 
                    entityValue=tostring(customDimensions.entityValue), 
                    intent=customDimensions.intent 
                  | where name=='MBFEvent.Entity' and intent =~'${intent}' 
                  | project conversation, entityType, entityValue, intent 
                  | summarize count=count() by entityType, entityValue`,
								format: {
									type: "bars",
									args: { barsField: "entityType",seriesField: "entityValue",valueField: "count",threshold: 10 }
								}
							},
							"total-conversations": {
								query: ({ intent }) => `
                  extend conversation=tostring(customDimensions.conversationId), intent=customDimensions.intent 
                  | where name=='MBFEvent.Intent' and intent =~ '${intent}' 
                  | summarize count_intents=count() by conversation  
                  | count`,
								format: {
									type: "scorecard",
									args: {
										countField: "Count",
										thresholds: [{ value: 0,color: "#2196F3",icon: "chat",heading: "Conversations" }]
									}
								}
							},
							"intent-utterances": {
								query: ({ intent }) => `
                  extend conversation=tostring(customDimensions.conversationId), 
                    intent=customDimensions.intent,
                    text=substring(customDimensions.text, 0, 50) 
                  | where name=='MBFEvent.Intent' and intent =~ '${intent}' 
                  | summarize count_utterances=count(), maxTimestamp=max(timestamp) by text 
                  | order by count_utterances 
                  | top 5 by count_utterances `
							}
						}
					}
				},
				{
					id: "intentSentiments",
					type: "ApplicationInsights/Query",
					dependencies: { intent: "dialog_intentsDialog:intent",queryTimespan: "dialog_intentsDialog:queryspan" },
					params: {
						query: ({ intent }) => `
              customEvents 
              | extend intent=customDimensions.intent 
              | where name startswith 'MBFEvent.Intent' and intent =~ '${intent}' 
              | extend timestamp=tostring(customDimensions.timestamp),
                conversation=tostring(customDimensions.conversationId),
                userId=tostring(customDimensions.userId) 
              | join kind= leftouter (
                customEvents 
                | where name startswith 'MBFEvent.Sentiment' 
                | extend timestamp=tostring(customDimensions.timestamp), 
                  sentiment=todouble(customDimensions.score),
                  conversation=tostring(customDimensions.conversationId),
                  userId=tostring(customDimensions.userId)
              ) on timestamp, userId, conversation 
              | summarize count=avg(sentiment)
            `
					},
					format: {
						type: "scorecard",
						args: {
							thresholds: [
								{ value: 0,color: "#D50000",icon: "sentiment_dissatisfied",heading: "Sentiment" },
								{ value: 40,color: "#FF9810",icon: "sentiment_neutral",heading: "Sentiment" },
								{ value: 60,color: "#AEEA00",icon: "sentiment_satisfied",heading: "Sentiment" }
							],
							subvalueThresholds: [
								{ value: 0,subheading: "Negative" },
								{ value: 40,subheading: "Neutral" },
								{ value: 60,subheading: "Positive" }
							]
						}
					}
				}
			],
			elements: [
				{
					id: "entity-usage",
					type: "BarData",
					title: "Entity count appearances in intent",
					subtitle: "Entity usage and count for the selected intent",
					size: { w: 6,h: 8 },
					source: "intents-data:entities-usage"
				},
				{
					id: "utterances",
					type: "Table",
					size: { w: 4,h: 8 },
					dependencies: { values: "intents-data:intent-utterances" },
					props: {
						cols: [
							{ header: "Top Utterances",width: "200px",field: "text" },
							{ header: "Count",field: "count_utterances",type: "number" }
						]
					}
				},
				{
					id: "intent-timeline",
					type: "Timeline",
					title: "Message Rate",
					subtitle: "How many messages were sent per timeframe",
					size: { w: 8,h: 8 },
					source: "intents-data:intent-usage-timeline"
				},
				{
					id: "conversations-count",
					type: "Scorecard",
					size: { w: 2,h: 8 },
					source: { conversations: "intents-data:total-conversations",sentiment: "intentSentiments" },
					dependencies: { card_conversations_onClick: "::onConversationsClick" },
					actions: {
						onConversationsClick: {
							action: "dialog:intentConversations",
							params: {
								title: "dialog_intentsDialog:title",
								intent: "dialog_intentsDialog:intent",
								queryspan: "dialog_intentsDialog:queryspan"
							}
						}
					}
				}
			]
		},
		{
			id: "intentConversations",
			width: "60%",
			params: ["title","intent","queryspan"],
			dataSources: [
				{
					id: "conversations-data",
					type: "ApplicationInsights/Query",
					dependencies: {
						intent: "dialog_intentConversations:intent",
						queryTimespan: "dialog_intentConversations:queryspan"
					},
					params: {
						query: ({ intent }) => ` 
              customEvents
              | extend conversation=tostring(customDimensions.conversationId), intent=customDimensions.intent
              | where name=='MBFEvent.Intent' and intent =~ '${intent}'
              | summarize count=count(), maxTimestamp=max(timestamp) by conversation
              | order by maxTimestamp`,
						mappings: { id: (val, row, idx) => `Conversation ${idx}` }
					}
				}
			],
			elements: [
				{
					id: "conversations-list",
					type: "Table",
					title: "Conversations",
					size: { w: 12,h: 16 },
					dependencies: { values: "conversations-data" },
					props: {
						cols: [
							{ header: "Conversation Id",field: "id" },
							{ header: "Last Message",field: "maxTimestamp",type: "time",format: "MMM-DD HH:mm:ss" },
							{ header: "Count",field: "count" },
							{ type: "button",value: "chat",click: "openMessagesDialog" }
						]
					},
					actions: {
						openMessagesDialog: {
							action: "dialog:messages",
							params: {
								title: "args:id",
								conversation: "args:conversation",
								intent: "dialog_intentConversations:intent",
								queryspan: "timespan:queryTimespan"
							}
						}
					}
				}
			]
		}
	],
	layouts: {
		lg: [
			{
				w: 5,
				h: 3,
				x: 0,
				y: 0,
				i: "customerTranscripts",
				minW: undefined,
				maxW: undefined,
				minH: undefined,
				maxH: undefined,
				moved: false,
				static: false,
				isDraggable: undefined,
				isResizable: undefined
			},
			{
				w: 4,
				h: 3,
				x: 5,
				y: 0,
				i: "customerWaiting",
				minW: undefined,
				maxW: undefined,
				minH: undefined,
				maxH: undefined,
				moved: false,
				static: false,
				isDraggable: undefined,
				isResizable: undefined
			},
			{
				w: 1,
				h: 8,
				x: 0,
				y: 3,
				i: "timelineScores",
				minW: undefined,
				maxW: undefined,
				minH: undefined,
				maxH: undefined,
				moved: false,
				static: false,
				isDraggable: undefined,
				isResizable: undefined
			},
			{
				w: 3,
				h: 11,
				x: 9,
				y: 0,
				i: "words",
				minW: undefined,
				maxW: undefined,
				minH: undefined,
				maxH: undefined,
				moved: false,
				static: false,
				isDraggable: undefined,
				isResizable: undefined
			},
			{
				w: 4,
				h: 8,
				x: 1,
				y: 3,
				i: "timeline",
				minW: undefined,
				maxW: undefined,
				minH: undefined,
				maxH: undefined,
				moved: false,
				static: false,
				isDraggable: undefined,
				isResizable: undefined
			},
			{
				w: 12,
				h: 15,
				x: 0,
				y: 11,
				i: "transcripts",
				minW: undefined,
				maxW: undefined,
				minH: undefined,
				maxH: undefined,
				moved: false,
				static: false,
				isDraggable: undefined,
				isResizable: undefined
			},
			{
				w: 4,
				h: 8,
				x: 5,
				y: 3,
				i: "intents",
				minW: undefined,
				maxW: undefined,
				minH: undefined,
				maxH: undefined,
				moved: false,
				static: false,
				isDraggable: undefined,
				isResizable: undefined
			}
		]
	}
}